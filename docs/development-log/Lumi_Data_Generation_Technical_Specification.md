# DigitalIsland --- Lumi 資料生成與持久化技術規格

> 文件類型：技術設計／交接文件\
> 文件狀態：設計規格（Design Specification），**不代表已完成實作**\
> 適用範圍：DigitalIsland 後端 Lumi
> 資料生成、事件持久化、錯誤紀錄、Generation 生命週期與歷史資料封存\
> 版本：1.0\
> 最後整理日期：2026-11-28

------------------------------------------------------------------------

## 1. 文件目的

本文件定義 Lumi
資料生成系統的預期架構、資料格式、生命週期、持久化規則與失敗處理方式，作為後續開發、測試、維護及人員交接的依據。

接手者應優先閱讀本文件，再檢視程式碼。若程式碼行為與本文件不一致，應先確認差異是：

1.  尚未實作的設計；
2.  實作缺陷；
3.  經正式決策後尚未更新文件的規格變更。

不得僅因程式碼目前如此運作，就推定該行為符合設計。

## 2. 系統目標與設計原則

### 2.1 目標

Lumi 在每次後端啟動時建立一個新的 Generation。運行期間產生的
Observation、Experience、Thought、Journal 事件，透過非同步寫入佇列保存為
JSONL。

系統必須能夠：

-   區分不同啟動週期所產生的資料。
-   保留歷史 Generation 的原始實驗紀錄。
-   將四種事件寫入同一個事件檔案，並維持全 Generation 共用的事件序號。
-   在寫入暫時失敗時，依固定次數與間隔重試。
-   在寫入結果不確定時，以 `event_id`
    檢查是否已經落盤，降低重複紀錄風險。
-   限制佇列容量，避免持續產生資料時無限制消耗記憶體。
-   將錯誤紀錄與實驗事件分開處理，避免錯誤紀錄寫入失敗直接阻塞 Lumi。
-   在重新啟動時建立新 Generation，不接續舊 Generation
    的執行狀態或待寫入佇列。
-   封存舊 Generation 時保留原始檔案，不刪除、不重寫歷史紀錄。

### 2.2 核心原則

  ----------------------------------------------------------------------------------------------------------
  原則                                定義
  ----------------------------------- ----------------------------------------------------------------------
  Generation 隔離                     每次後端啟動建立新的 Generation；不同 Generation
                                      的執行期記憶體與事件序號互相獨立。

  歷史保留                            歷史 Generation 的原始紀錄永久保留；封存只移動目錄，不修改內容。

  Append-only                         JSONL 以追加方式寫入，不回頭改寫既有事件紀錄。

  Best-effort persistence             事件會立即進入寫入流程，但佇列滿載、寫入失敗或強制關閉時仍可能遺失。

  有界資源                            實驗事件佇列與錯誤佇列均有容量上限。

  單一寫入者                          每一類 Writer 使用單一序列化佇列，避免同一檔案的並行追加競爭。

  不假裝成功                          未成功完成狀態寫入時，不得將 Generation 標示為 `completed`。

  保留原始證據                        格式錯誤或不支援的 JSONL
                                      資料只跳過並記錄錯誤，不修改、不隔離、不刪除原始行。
  ----------------------------------------------------------------------------------------------------------

## 3. 名詞定義

### 3.1 Generation

Generation 是 Lumi 一次獨立的後端啟動週期。每次啟動都建立新的
Generation，不恢復上一個 Generation 的執行期記憶體。

每個 Generation 擁有自己的：

-   `generation.json`
-   `events.jsonl`
-   `errors.jsonl`
-   可選的 `generation.abandoned` 標記檔

### 3.2 Event

Event 是 Lumi 產生並交由 Experimental Writer
保存的一筆實驗資料。事件種類包括：

-   `observation`
-   `experience`
-   `thought`
-   `journal`

四種事件共用同一個 `events.jsonl`、同一個 `sequence_number`
序號空間及同一個 Experimental Writer。

### 3.3 Experimental Writer

負責將四種 Lumi 實驗事件依序追加至目前 Generation 的 `events.jsonl`。

### 3.4 Error Writer

負責將系統錯誤、資料解析錯誤、寫入失敗等診斷資訊，非同步追加至對應
Generation 的 `errors.jsonl`。

Error Writer 與 Experimental Writer 使用不同佇列，彼此獨立。

### 3.5 Archive

Archive 是歷史 Generation 的封存位置。封存作業會移動整個 Generation
目錄，不會刪除或重寫其中的原始檔案。

## 4. 資料目錄結構

預期目錄結構如下：

``` text
server/
└── data/
    └── lumi/
        ├── generations/
        │   └── generation_20261128T050000123Z/
        │       ├── generation.json
        │       ├── events.jsonl
        │       ├── errors.jsonl
        │       └── generation.abandoned   # 視情況存在
        │
        └── archive/
            └── generation_20261127T145000123Z/
                ├── generation.json
                ├── events.jsonl
                ├── errors.jsonl
                └── generation.abandoned   # 視情況存在
```

### 4.1 目錄用途

  --------------------------------------------------------------------------------
  路徑                                用途
  ----------------------------------- --------------------------------------------
  `server/data/lumi/generations/`     放置目前及尚未封存的 Generation。

  `server/data/lumi/archive/`         放置已封存的歷史 Generation。

  `generation.json`                   保存 Generation
                                      的識別資訊與目前生命週期狀態。

  `events.jsonl`                      保存
                                      Observation、Experience、Thought、Journal
                                      四種事件。

  `errors.jsonl`                      保存錯誤與診斷事件，不保存原始
                                      Thought／Journal 內容。

  `generation.abandoned`              當 `generation.json`
                                      缺失或損壞、無法可靠判讀狀態時，提供獨立的
                                      abandoned 標記。
  --------------------------------------------------------------------------------

### 4.2 Generation ID

格式：

``` text
generation_YYYYMMDDTHHmmssSSSZ
```

範例：

``` text
generation_20261127T145000123Z
```

規則：

-   使用 UTC 時間。
-   精確到毫秒。
-   時間字串中的 `Z` 表示 UTC。
-   若 ID 發生碰撞，依序附加 `_001`、`_002` 等後綴。
-   碰撞檢查範圍包含 `generations/` 與 `archive/`。
-   使用目錄的 exclusive create（例如 `mkdir` 不允許既有目錄）保留 ID。
-   若目錄已存在，視為 ID 碰撞並嘗試下一個後綴。
-   若遇到權限不足、磁碟錯誤等非碰撞錯誤，必須回報真正的檔案系統錯誤，不得當作
    ID 碰撞而無限重試。
-   Generation ID 一旦使用，即使初始化中斷也不得刪除或重用。

## 5. Generation 生命週期

### 5.1 狀態定義

`generation.json` 的 `status` 欄位使用以下值：

  --------------------------------------------------------------------------------
  狀態                                意義
  ----------------------------------- --------------------------------------------
  `initializing`                      Generation 目錄已建立，初始化尚未完成。

  `active`                            最近一次成功寫入的狀態為執行中。這不保證該
                                      Generation 此刻仍有程序運行。

  `completed`                         正常關閉流程已成功寫入完成狀態。

  `abandoned`                         初始化未完成，且可成功更新狀態為 abandoned。
  --------------------------------------------------------------------------------

`generation.json` 只保存目前狀態，不保存狀態轉換歷史。

### 5.2 generation.json 格式

建議格式：

``` json
{
  "schema_version": 1,
  "generation_id": "generation_20261128T050000123Z",
  "created_at": "2026-11-28T05:00:00.123Z",
  "status": "active"
}
```

欄位：

  ---------------------------------------------------------------------------------------
  欄位                    型別                    說明
  ----------------------- ----------------------- ---------------------------------------
  `schema_version`        integer                 Generation metadata schema 版本，初始為
                                                  `1`。

  `generation_id`         string                  必須與目錄名稱相同。

  `created_at`            string                  UTC ISO-8601 時間。

  `status`                string                  `initializing`、`active`、`abandoned`
                                                  或 `completed`。
  ---------------------------------------------------------------------------------------

`generation.json`
採直接覆寫，不採用暫存檔加原子替換。這是已接受的設計取捨：若程序在覆寫期間崩潰，檔案可能被截斷或損壞。

### 5.3 啟動後對歷史 Generation 的判讀

啟動時掃描 `generations/` 與 `archive/` 中的 Generation
目錄，依下列規則處理：

  --------------------------------------------------------------------------------
  既有狀況                            處理方式
  ----------------------------------- --------------------------------------------
  `generation.json` 有效，狀態為      原樣保留。不得因上次程序可能異常結束而改成
  `active`                            abandoned。

  `generation.json` 有效，狀態為      原樣保留。
  `completed`                         

  `generation.json` 有效，狀態為      原樣保留。
  `abandoned`                         

  `generation.json` 有效，狀態為      視為初始化中斷，將狀態直接更新為
  `initializing`                      `abandoned`。若更新失敗，嘗試建立
                                      `generation.abandoned` 標記。

  `generation.json` 缺失              不重建、不猜測原狀態；建立
                                      `generation.abandoned`。

  `generation.json` 損壞或無法解析    不修復、不覆寫原檔；建立
                                      `generation.abandoned`。

  已存在 `generation.abandoned`       保留，不重複修改。
  --------------------------------------------------------------------------------

**重要：** 有效的 `active` 狀態必須原樣保留。因為 `active`
代表最後一次成功寫入的生命週期狀態，不代表目前仍有程序持有該
Generation。

### 5.4 abandoned 標記

`generation.abandoned` 是獨立標記檔，建立時採不覆蓋既有檔案的方式。

它主要用於 `generation.json`
缺失或損壞、無法安全判讀狀態的情況。不得為了建立標記而修改原本的
`generation.json` 或 JSONL 檔案。

若必要的 abandoned
標記無法建立，應視為啟動資料完整性問題並中止啟動，而不是默默忽略。

## 6. 啟動流程

### 6.1 啟動順序

1.  讀取並驗證佇列容量環境變數。
2.  建立或確認 Lumi 資料根目錄、`generations/`、`archive/`。
3.  掃描既有 Generation，檢查目錄名稱、ID 碰撞及 `generation.json`
    狀態。
4.  依第 5.3 節規則處理初始化中斷、缺失或損壞的 metadata。
5.  以 UTC 毫秒時間產生新的 Generation ID。
6.  使用 exclusive directory creation 保留新 ID。
7.  建立新 Generation 的 `generation.json`，初始狀態為 `initializing`。
8.  建立或確認新 Generation 的 `events.jsonl` 與 `errors.jsonl`。
9.  掃描新 Generation 的 `events.jsonl`，建立目前 Generation 的
    persisted `event_id` Set。
10. 啟動 Error Writer。
11. 將前述掃描或 metadata 問題轉成錯誤事件，送入 Error Writer。
12. 啟動 Experimental Writer。
13. 將新 Generation 的 `generation.json` 更新為 `active`。
14. 只有在 `active` 狀態成功寫入後，才允許 Lumi 開始接收並產生事件。
15. 將其他舊 Generation 目錄移入 `archive/`；封存失敗不應使新 Generation
    停止運作，但必須留下錯誤紀錄。

### 6.2 啟動失敗處理

以下情況屬於啟動關鍵錯誤：

-   佇列容量環境變數明確設定但格式或範圍不合法。
-   無法建立資料根目錄或必要的 Generation 目錄。
-   無法安全保留新的 Generation ID。
-   無法建立必要的 Generation metadata。
-   新 Generation 無法成功更新為 `active`。
-   必要的歷史 Generation abandoned 標記無法建立。

啟動關鍵錯誤發生時，不得讓 Lumi 進入正常事件產生狀態。

若新 Generation 已建立但初始化失敗：

-   保留該 Generation 目錄及其中所有檔案。
-   不刪除、不重用該 Generation ID。
-   若 metadata 有效且可寫，將狀態更新為 `abandoned`。
-   若 metadata 缺失或損壞，建立 `generation.abandoned`。
-   若標記也無法建立，保留現場並回報啟動失敗。

### 6.3 歷史目錄封存時機

新 Generation 成功進入 `active` 後，嘗試封存其他歷史 Generation。

-   只移動整個 Generation 目錄。
-   來源與目的地應位於同一檔案系統，以使用目錄 rename。
-   不採用 copy-then-delete 作為自動 fallback。
-   不覆蓋 `archive/` 中既有的同名目錄。
-   rename 失敗時，保留來源目錄原狀，記錄錯誤並繼續服務。
-   封存不得修改 Generation 內的 `generation.json`、`events.jsonl` 或
    `errors.jsonl`。
-   當封存失敗時，該 Generation 留在
    `generations/`，下次啟動可再次嘗試。

若同一 Generation ID 同時存在於 `generations/` 與
`archive/`，視為儲存完整性衝突，不得任意覆蓋或合併。應保留兩邊資料並回報錯誤；新
ID 產生器仍必須將該 ID 視為已使用。

## 7. 實驗事件資料格式

### 7.1 統一事件檔案

四種事件統一寫入：

``` text
events.jsonl
```

每一行是一筆完整 JSON 物件，行尾以 `\n` 結束。

`event_type` 用來區分事件種類：

-   `observation`
-   `experience`
-   `thought`
-   `journal`

### 7.2 統一事件 envelope

``` json
{
  "schema_version": 1,
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "generation_id": "generation_20261128T050000123Z",
  "sequence_number": 1,
  "event_type": "observation",
  "created_at": "2026-11-28T05:00:01.234Z",
  "payload": {}
}
```

  -----------------------------------------------------------------------
  欄位                    型別                    規則
  ----------------------- ----------------------- -----------------------
  `schema_version`        integer                 事件 schema
                                                  版本，初始為 `1`。

  `event_id`              UUID string             每筆事件建立時產生
                                                  UUIDv4。

  `generation_id`         string                  必須等於目前 Generation
                                                  ID。

  `sequence_number`       positive integer        Generation
                                                  內全域遞增，從 `1`
                                                  開始。

  `event_type`            string                  僅允許四種事件類型。

  `created_at`            string                  事件建立時間，UTC
                                                  ISO-8601。

  `payload`               object                  該事件類型專屬資料。
  -----------------------------------------------------------------------

各類 `payload` 的欄位定義應由對應事件型別的程式介面或獨立 schema
文件維護。本文件不虛構尚未確認的 payload 欄位。

### 7.3 event_id 規則

-   在事件建立時產生 UUIDv4。
-   一筆事件從首次寫入到所有重試，始終使用同一個 `event_id`。
-   重試不得重新產生 ID。
-   `event_id` 在 Generation 範圍內應唯一。
-   不要求跨 Generation 全域唯一；UUIDv4
    的隨機碰撞風險可忽略，但實作仍應檢查目前 Generation 的 persisted ID
    Set。

### 7.4 sequence_number 規則

-   Observation、Experience、Thought、Journal 共用同一個序號計數器。
-   每個 Generation 從 `1` 開始。
-   在事件建立時分配，不是在成功寫入時分配。
-   事件若因佇列滿載或最終寫入失敗而遺失，該序號仍然消耗。
-   序號不得重用，因此允許出現缺號。
-   不同 Generation 的序號互不相關。

範例：

``` text
sequence 1: observation  -> persisted
sequence 2: thought      -> queue full, dropped
sequence 3: journal      -> persisted
```

此時 `events.jsonl` 中可能只有 `1` 與
`3`，這是預期行為，不代表資料排序錯誤。

### 7.5 schema_version 規則

-   每筆事件各自帶有 `schema_version`。
-   初始版本為整數 `1`。
-   只有在 schema 發生不相容變更時才增加版本。
-   舊版資料不應因新版程式啟動而被批次改寫。
-   遇到不支援的未來版本時，依第 11 節規則跳過並記錄錯誤。

## 8. Experimental Writer：事件寫入架構

### 8.1 佇列模型

-   所有四種事件進入同一個 Experimental Writer Queue。
-   使用單一 Writer 序列化寫入 `events.jsonl`。
-   嚴格 FIFO：依事件進入佇列的順序處理。
-   寫入中的事件未完成前，後續事件不得越過它。
-   事件建立後立即 enqueue，不等待其他事件型別批次累積。
-   佇列滿載時採 drop-newest，不丟棄既有佇列項目。

### 8.2 佇列容量

環境變數：

``` text
LUMI_EXPERIMENTAL_QUEUE_CAPACITY
```

  設定             值
  ---------- --------
  預設容量      1,000
  最小值            1
  最大值       10,000

驗證規則：

-   未設定：使用預設值 `1000`。
-   已設定：必須是正整數，且介於 `1` 至 `10000`。
-   空字串、非數字、小數、零、負數或超過上限：啟動失敗。
-   錯誤訊息必須包含環境變數名稱、實際輸入值與允許範圍。

### 8.3 Queue full 行為

當佇列已滿：

1.  拒絕最新進來的事件。
2.  不移除或覆蓋已排隊事件。
3.  不保留被拒絕事件的 payload。
4.  不阻塞 Lumi 主流程。
5.  將佇列滿載資訊送入 Error Writer。
6.  被拒絕事件的 `sequence_number` 不回收、不重用。

這代表事件持久化是 best-effort，而不是每筆必定保存。

### 8.4 寫入成功定義

Experimental Writer 的一次寫入成功，定義為檔案 append/write API
正常完成。

不要求每筆事件呼叫 `fsync`。

因此：

-   API 成功完成後，Writer 可將該事件視為已成功寫入。
-   若作業系統尚未將資料實際 flush
    到物理儲存裝置，突然斷電仍可能造成資料遺失。
-   本系統不提供每筆事件的強制物理落盤保證。

### 8.5 重試政策

每筆事件最多執行四次寫入嘗試：

  嘗試         時機
  ------------ -----------------------
  第一次       立即寫入
  第一次重試   第一次失敗後等待 1 秒
  第二次重試   第二次失敗後等待 2 秒
  第三次重試   第三次失敗後等待 4 秒

也就是：

-   初次寫入 1 次。
-   最多重試 3 次。
-   總嘗試次數最多 4 次。
-   重試間隔為 `1s → 2s → 4s`。
-   同一事件重試期間，後續事件不得越過它。
-   不進行無限重試。
-   不因重試而改變 `event_id` 或 `sequence_number`。

四次嘗試均失敗後：

1.  丟棄事件 payload。
2.  不再保留原始 Thought／Journal 內容。
3.  將必要診斷資訊送入 Error Writer。
4.  繼續處理下一筆事件。

## 9. 寫入結果不確定與去重

### 9.1 為什麼需要去重

檔案 append API
可能出現結果不確定的情況：資料可能已部分或完整寫入，但呼叫端仍收到錯誤。

若直接重試，可能在檔案中產生同一事件的重複紀錄。

### 9.2 in-memory event_id Set

目前 Generation 維護一個已持久化 `event_id` 的記憶體 Set：

-   啟動時掃描目前 Generation 的 `events.jsonl`，建立 Set。
-   事件成功寫入後，將 `event_id` 加入 Set。
-   不載入歷史 Generation 或 Archive 的 ID Set。
-   不為每次正常寫入掃描整個檔案。

因為每次後端啟動都建立新 Generation，舊 Generation
不會恢復執行；因此只需要目前 Generation 的索引。

### 9.3 模糊寫入結果的處理

當 append API 回報錯誤、無法確定資料是否已寫入時：

1.  暫停後續事件處理，維持 FIFO。
2.  對目前 `events.jsonl` 執行一次針對性的檢查。
3.  搜尋是否已有相同 `event_id` 的完整、有效紀錄。
4.  若找到：視為該事件已持久化，將 ID 加入 Set，不再重複追加。
5.  若未找到：依重試排程重試，沿用原本的 `event_id`。
6.  若達到最終失敗：丟棄 payload，送出錯誤診斷事件。

正常成功的寫入不需要重新掃描檔案。

### 9.4 JSONL 尾端不完整資料

JSONL 的完整紀錄必須以換行符號 `\n` 結束。

若一次寫入失敗留下未換行的尾端資料，下一次追加前必須先檢查檔案尾端：

-   若尾端已換行，正常追加。
-   若尾端沒有換行，先追加一個
    `\n`，將既有尾端隔離成獨立一行，再追加新事件。
-   不得回頭截斷、覆寫或刪除既有尾端 bytes。
-   若未換行尾端本身是可解析且 `event_id`
    相同的完整事件，可透過追加換行完成該筆 JSONL framing，再視為已保存。
-   若尾端內容不完整或無效，保留原始 bytes，以換行隔離，並記錄
    damaged-tail 錯誤。

這是 append-only 的補充分隔，不是重寫或修復原始內容。

### 9.5 重複 event_id

若啟動掃描發現同一 `event_id` 出現多次：

-   保留原始檔案，不刪除重複行。
-   以第一筆有效紀錄建立索引。
-   後續相同 ID 紀錄不重複加入 Set。
-   產生 duplicate event ID 錯誤紀錄。

## 10. Error Writer：錯誤紀錄架構

### 10.1 設計原則

Error Writer 與 Experimental Writer 完全分離：

-   使用獨立 Queue。
-   使用單一序列化 Writer。
-   不阻塞 Lumi 主流程。
-   不執行重試。
-   寫入失敗即丟棄該錯誤事件。
-   Queue 滿載時丟棄最新錯誤事件。
-   不保存被丟棄錯誤事件的完整 payload。

Error Writer 可將錯誤寫入不同 Generation 的
`errors.jsonl`。錯誤紀錄應寫回所屬 Generation；若是啟動期間發現歷史
Generation 的 metadata 問題，應在封存路徑確定後，寫入該 Generation
自己的 `errors.jsonl`。

### 10.2 佇列容量

環境變數：

``` text
LUMI_ERROR_QUEUE_CAPACITY
```

  設定            值
  ---------- -------
  預設容量       200
  最小值           1
  最大值       2,000

驗證方式與 Experimental Writer 相同：

-   未設定使用 `200`。
-   已設定必須為 `1` 至 `2000` 的正整數。
-   明確設定但不合法時，後端啟動失敗。
-   錯誤訊息需包含變數名稱、輸入值與允許範圍。

### 10.3 Queue full 行為

當 Error Queue 已滿：

-   丟棄最新錯誤事件。
-   保留已排隊錯誤事件。
-   不阻塞主流程。
-   不保留被丟棄錯誤事件的 payload。
-   不嘗試以另一個錯誤紀錄來記錄「錯誤紀錄佇列也滿了」，避免遞迴產生錯誤。

### 10.4 寫入與重試

-   Error Writer 使用 append/write API。
-   寫入 API 正常完成即視為成功，不要求 `fsync`。
-   不重試。
-   寫入失敗後丟棄該錯誤事件。
-   若錯誤檔案尾端沒有換行，追加新紀錄前先追加換行，以隔離既有不完整尾端。
-   不重寫既有錯誤紀錄。

### 10.5 Error record 格式

建議格式：

``` json
{
  "schema_version": 1,
  "error_id": "550e8400-e29b-41d4-a716-446655440001",
  "generation_id": "generation_20261128T050000123Z",
  "occurred_at": "2026-11-28T05:00:02.345Z",
  "error_type": "experimental_write_failed",
  "source": "experimental_writer",
  "message": "Event append failed after all attempts.",
  "file_name": "events.jsonl",
  "line_number": null,
  "sequence_number": 12,
  "event_type": "thought",
  "attempts": 4
}
```

欄位可依錯誤種類省略不適用的欄位。Error record 不得包含原始事件
payload、Thought 文字、Journal 內容或其他不必要的敏感資料。

建議保留的診斷資訊：

-   `schema_version`
-   `error_id`
-   `generation_id`
-   `occurred_at`
-   `error_type`
-   `source`
-   經過清理且有長度上限的錯誤訊息或錯誤代碼
-   `file_name`
-   `line_number`
-   `sequence_number`
-   `event_type`
-   `attempts`

`error_id` 使用 UUIDv4。錯誤事件不使用實驗事件的 `sequence_number`
空間。

## 11. JSONL 啟動掃描與資料驗證

### 11.1 掃描範圍

每次啟動只建立目前新 Generation 的 `event_id` Set，不載入所有歷史
Generation 或 Archive 的事件索引。

由於新 Generation 的 `events.jsonl`
通常是空檔案，掃描仍保留為標準初始化步驟，確保未來若初始化流程或資料建立順序調整，索引建立邏輯仍一致。

舊 Generation 的 JSONL 保持原樣，不因新後端啟動而批次解析或改寫。

### 11.2 每行驗證項目

對於掃描範圍內的每一行，應驗證：

1.  該行是否以 `\n` 結尾。
2.  是否為有效 JSON。
3.  `schema_version` 是否為支援的整數版本。
4.  `event_id` 是否為 UUID 格式。
5.  `generation_id` 是否與目前 Generation 相同。
6.  `sequence_number` 是否為正整數。
7.  `event_type` 是否為允許的四種事件之一。
8.  `created_at` 是否為有效時間字串。
9.  `payload` 是否為 object。
10. `event_id` 是否已存在於索引。

### 11.3 不合法資料處理

  ----------------------------------------------------------------------------
  狀況                                行為
  ----------------------------------- ----------------------------------------
  JSON 格式錯誤                       跳過該行，記錄錯誤，繼續掃描。

  不支援的 `schema_version`           跳過該行，記錄錯誤，繼續掃描。

  必要欄位缺失或型別錯誤              跳過該行，記錄錯誤，繼續掃描。

  `generation_id` 不符                跳過該行，記錄錯誤，繼續掃描。

  未知 `event_type`                   跳過該行，記錄錯誤，繼續掃描。

  重複 `event_id`                     保留原檔，索引只保留第一筆，記錄錯誤。

  最後一行未以換行結束                視為不完整尾端，不加入索引，記錄
                                      damaged-tail 錯誤。
  ----------------------------------------------------------------------------

### 11.4 原始資料保護

-   不修改來源 JSONL。
-   不刪除錯誤行。
-   不建立 quarantine 副本。
-   不搬移錯誤行。
-   不將原始事件 payload 放入錯誤紀錄。
-   跳過資料只影響本次索引建立，不代表原始紀錄被移除。

因為跳過的行不會進入 `event_id`
Set，若後續發生相同事件的重試，去重能力可能不完整。這是保留原始資料、不擅自修復所接受的風險。

## 12. 關閉流程

### 12.1 正常關閉

正常關閉採立即結束策略，不等待 Experimental Writer Queue 清空。

順序：

1.  停止接受新的 Lumi 事件。
2.  停止新的事件進入 Experimental Writer Queue。
3.  將目前 Generation 的 `generation.json` 狀態更新為 `completed`。
4.  `completed` 成功寫入後，立即關閉後端。

不等待 Experimental Writer Queue drain，也不等待所有重試完成。

### 12.2 關閉時可能遺失的資料

正常關閉時：

-   尚在 Experimental Queue 中的事件可能被放棄。
-   正在執行中的 append 結果可能不確定。
-   尚未寫入的 Error Queue 項目可能遺失。
-   已由 append API 確認成功的事件仍可能因未 `fsync`
    而在突然斷電時遺失。

因此 `completed` 表示正常關閉流程成功更新了 Generation
狀態，不代表所有已建立事件都已完整持久化。

### 12.3 completed 狀態更新失敗

若 `generation.json` 無法成功更新為 `completed`：

-   不得假裝關閉成功。
-   正常關閉流程中止。
-   後端應維持可供人工處理的狀態。
-   將狀態更新失敗送入該 Generation 的 Error Writer。
-   操作者必須明確選擇修復問題或執行強制關閉。

### 12.4 強制關閉

若正常關閉因 `completed` 寫入失敗而無法完成，允許人工執行 force
shutdown。

強制關閉規則：

-   不得將 Generation 偽裝成 `completed`。
-   保留原本 `generation.json` 狀態及所有 JSONL。
-   將狀態更新失敗與 force shutdown 資訊送入該 Generation 的
    `errors.jsonl`。
-   不保證 Error Queue 在程序退出前完成寫入。
-   不保證 Experimental Queue 中尚未完成的事件被保存。
-   不得為了強制關閉而清空或重寫歷史事件檔。

## 13. 重新啟動與復原策略

### 13.1 不恢復舊 Generation

後端重新啟動時：

-   一律建立新的 Generation。
-   不恢復上一個 Generation 的 Lumi in-memory state。
-   不恢復上一個 Generation 的 Experimental Queue。
-   不重播上一個 Generation 尚未完成的事件。
-   不重新執行上一個 Generation 的待寫入重試。
-   不將舊 Generation 的 `active` 狀態自動改成 `abandoned`。
-   舊資料原樣保留，供後續查詢或分析。

### 13.2 Crash recovery 的界線

系統不承諾復原崩潰前尚未成功保存的事件。

重新啟動後只會建立新 Generation。舊 Generation 內已存在的 JSONL
保持原樣；不完整尾端不會被自動截斷或重寫。

### 13.3 資料完整性語意

應區分以下狀態：

-   **事件已建立：** 已取得 `event_id` 與 `sequence_number`。
-   **事件已排隊：** 已進入 Experimental Queue，但尚未代表持久化成功。
-   **事件寫入 API 成功：** append/write API 正常完成。
-   **事件已物理落盤：** 本系統不以 `fsync` 保證此狀態。
-   **事件已遺失：** 可能因 Queue
    full、四次寫入失敗、程序強制結束或系統崩潰而未保存。

不可將「已建立」或「已排隊」描述成「已保存」。

## 14. 設定總表

  -----------------------------------------------------------------------------------------------------------------------
  環境變數                                      預設值          最小值          最大值 用途
  ------------------------------------ --------------- --------------- --------------- ----------------------------------
  `LUMI_EXPERIMENTAL_QUEUE_CAPACITY`              1000               1           10000 四種實驗事件共用的寫入佇列容量。

  `LUMI_ERROR_QUEUE_CAPACITY`                      200               1            2000 錯誤紀錄寫入佇列容量。
  -----------------------------------------------------------------------------------------------------------------------

所有容量設定均須在啟動早期完成驗證。若使用者明確設定了不合法的值，應直接啟動失敗，不可靜默回退預設值。

## 15. 重要設計取捨與已知限制

  ------------------------------------------------------------------------------------------------
  項目                    已採用設計              影響／風險
  ----------------------- ----------------------- ------------------------------------------------
  寫入 durability         append API 完成，不要求 突然斷電可能遺失已回報成功但尚未 flush 的資料。
                          `fsync`                 

  Queue full              drop-newest             高負載時新事件會遺失，但不會無限制消耗記憶體。

  Experimental retry      最多 3 次重試           短暫錯誤有機會恢復；持續錯誤仍會遺失事件。

  FIFO                    嚴格 FIFO               單筆事件重試會阻塞後續事件，形成 head-of-line
                                                  blocking。

  Shutdown                不等待 Experimental     正常關閉仍可能遺失排隊中的事件。
                          Queue drain             

  Error Writer            無重試                  錯誤紀錄本身也可能遺失。

  JSONL repair            不改寫原始行            損壞行會永久保留，且可能降低去重能力。

  Generation metadata     直接覆寫                寫入中斷可能造成 metadata 損壞。

  Restart                 建立新 Generation       不提供跨程序的 queue replay 或 in-memory state
                                                  recovery。

  Archive                 目錄 rename             rename 失敗時歷史目錄留在原位置，不以
                                                  copy/delete 自動替代。
  ------------------------------------------------------------------------------------------------

## 16. 建議驗收測試

以下是實作完成後應具備的測試項目。這些是驗收要求，不代表目前已經執行。

### 16.1 Generation ID 與生命週期

-   [ ] 啟動時建立新的 Generation。
-   [ ] ID 使用 UTC 毫秒格式。
-   [ ] ID 碰撞時正確附加 `_001`、`_002`。
-   [ ] 碰撞檢查涵蓋 `generations/` 與 `archive/`。
-   [ ] 目錄 exclusive create 可避免競爭條件下重複保留 ID。
-   [ ] 初始化中斷的 `initializing` Generation 會被標記為 abandoned。
-   [ ] 有效的歷史 `active` 狀態不會被自動修改。
-   [ ] 缺失或損壞的 `generation.json` 不會被重建，並會建立 abandoned
    marker。
-   [ ] 正常關閉成功後狀態為 `completed`。
-   [ ] `completed` 寫入失敗時正常關閉中止。
-   [ ] Force shutdown 不會偽造 `completed` 狀態。

### 16.2 Event schema 與序號

-   [ ] 四種事件均寫入同一個 `events.jsonl`。
-   [ ] 每筆事件都有 UUIDv4 `event_id`。
-   [ ] 重試時沿用同一個 `event_id`。
-   [ ] 四種事件共用全域遞增 `sequence_number`。
-   [ ] Queue full 或最終寫入失敗後，序號不回收。
-   [ ] 每筆事件包含 `schema_version`。
-   [ ] 每筆 JSONL 紀錄以換行結束。

### 16.3 Experimental Writer

-   [ ] 單一 Writer 嚴格 FIFO。
-   [ ] Queue 容量預設值為 1000。
-   [ ] 環境變數有效值可覆蓋預設值。
-   [ ] 非法環境變數值會使啟動失敗。
-   [ ] Queue full 時只丟棄最新事件。
-   [ ] 重試間隔為 1 秒、2 秒、4 秒。
-   [ ] 最多四次總寫入嘗試。
-   [ ] 單筆事件重試時後續事件不越過。
-   [ ] append API 成功後更新 persisted ID Set。
-   [ ] 模糊寫入結果會先檢查 `event_id`，避免直接重複追加。
-   [ ] 四次失敗後丟棄 payload，並送出錯誤診斷資訊。

### 16.4 JSONL 解析與去重

-   [ ] 正常紀錄可建立 `event_id` Set。
-   [ ] malformed JSON 行會跳過並記錄錯誤。
-   [ ] 未支援 schema version 會跳過並記錄錯誤。
-   [ ] 不合法 envelope 會跳過並記錄錯誤。
-   [ ] 重複 `event_id` 不會重複加入索引。
-   [ ] 未換行尾端不會被當作完整紀錄。
-   [ ] 原始檔案既有 bytes 不會被截斷或覆寫。
-   [ ] 寫入失敗留下未換行尾端時，後續追加會先以換行隔離。

### 16.5 Error Writer

-   [ ] Error Queue 預設容量為 200。
-   [ ] 非法容量設定會使啟動失敗。
-   [ ] Error Queue full 時丟棄最新錯誤，不阻塞主流程。
-   [ ] Error Writer 不重試。
-   [ ] Error Writer 失敗不會造成遞迴錯誤紀錄。
-   [ ] 錯誤紀錄不包含原始 Thought／Journal payload。
-   [ ] 歷史 Generation 的錯誤寫入其所屬 `errors.jsonl`。

### 16.6 Archive 與 Shutdown

-   [ ] 舊 Generation 以整個目錄 rename 封存。
-   [ ] 封存不改寫內部檔案。
-   [ ] 同名目的目錄存在時不覆蓋。
-   [ ] rename 失敗時來源目錄仍保留。
-   [ ] 正常關閉不等待 Experimental Queue drain。
-   [ ] 關閉時停止接受新事件。
-   [ ] `completed` 寫入成功後立即關閉。
-   [ ] Force shutdown 保留既有 Generation 狀態與事件檔案。

## 17. 實作交接注意事項

### 17.1 建議程式模組責任

實際檔案名稱可依現有專案調整，但責任應清楚分離：

  ----------------------------------------------------------------------------------
  模組責任                            應負責的工作
  ----------------------------------- ----------------------------------------------
  Generation Manager                  建立 ID、保留目錄、讀寫
                                      `generation.json`、處理狀態與 abandoned
                                      marker。

  Generation Scanner                  掃描歷史目錄、判讀 metadata、辨識 ID 衝突。

  Archive Manager                     將舊 Generation 目錄移至 archive。

  Event Schema                        定義事件 envelope、事件型別及版本驗證。

  Experimental Writer                 管理實驗事件 Queue、FIFO、重試、append、去重。

  Error Writer                        管理獨立錯誤 Queue 與 `errors.jsonl` 寫入。

  JSONL Reader                        逐行解析、驗證、建立 event ID 索引。

  Lumi Lifecycle Controller           協調啟動、開始接收事件、正常關閉與強制關閉。
  ----------------------------------------------------------------------------------

### 17.2 修改規格的要求

若未來要修改以下項目，應同步更新本文件並記錄決策：

-   Generation ID 格式或碰撞規則。
-   Generation 狀態語意。
-   Event envelope 或 payload schema。
-   `event_id` 或 `sequence_number` 規則。
-   Queue 容量、滿載策略或重試策略。
-   JSONL 成功判定與 durability。
-   啟動復原或關閉策略。
-   Archive 移動策略。
-   錯誤紀錄欄位或敏感資料規則。

不得只改程式碼而不更新交接文件。

## 18. 明確不在本規格承諾範圍內的能力

本設計目前不提供：

-   每筆事件的 `fsync` 物理落盤保證。
-   跨程序恢復尚未完成的 Writer Queue。
-   重新啟動後重播未完成事件。
-   保證每一筆已建立事件最終都會保存。
-   自動修復或重寫 malformed JSONL。
-   自動清除歷史 Generation。
-   自動合併重複 Generation。
-   對歷史 Generation 建立常駐的 `event_id` 索引。
-   將 Thought／Journal 原文複製到錯誤紀錄。

------------------------------------------------------------------------

## 附錄 A：快速操作語意

  -----------------------------------------------------------------------
  問題                                系統預期行為
  ----------------------------------- -----------------------------------
  後端重新啟動會接續上一代 Lumi 嗎？  不會，建立新的 Generation。

  舊 Generation 的 `active`           不會，有效的 `active` 原樣保留。
  會自動變成 abandoned 嗎？           

  四種事件分開存檔嗎？                不會，統一寫入 `events.jsonl`。

  事件序號跨類型共用嗎？              是，同一 Generation 全域遞增。

  重試會產生新 event ID 嗎？          不會，沿用建立時的 UUIDv4。

  Queue 滿了會阻塞 Lumi 嗎？          不會，丟棄最新事件並記錄錯誤。

  寫入會無限重試嗎？                  不會，最多四次總嘗試。

  正常關閉會等事件佇列清空嗎？        不會。

  錯誤紀錄會重試嗎？                  不會。

  malformed JSONL 會被修復或刪除嗎？  不會，跳過並記錄錯誤。

  歷史 Generation 會被刪除嗎？        不會，只會整個目錄移入 archive。

  `completed`                         不可以；須人工處理或明確 force
  寫入失敗可以照常正常關閉嗎？        shutdown。
  -----------------------------------------------------------------------

## 附錄 B：目前規格的核心一句話

**每次後端啟動建立一個全新的 Lumi
Generation；四種實驗事件以共用序號、UUIDv4 與版本化 envelope，透過有界
FIFO JSONL Writer 盡力保存；錯誤由獨立有界 Writer 保存；歷史 Generation
永久保留並以整個目錄封存，系統不承諾跨重啟恢復未完成的寫入。**
