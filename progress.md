# Lumi 資料持久化 — 進度表

> 這份檔案是整個實作的「總覽」。每個 Phase 結束時，由 coding agent 更新。
> 依據文件：
> - Lumi_Data_Generation_Technical_Specification.md（規格，唯一設計依據）
> - decisions.md（五項決策，補充規格）
> - implementation-plan.md（七階段計畫）

最後更新：2026-11-28（Phase 1 Config 實作中；程式與測試已新增，正式專案測試尚待執行）

---

## 階段進度

| Phase | 內容 | 狀態 | 測試 | Commit / Branch | 備註 |
|-------|------|------|------|-----------------|------|
| 0 | 前置：盤點四種事件現有 payload（唯讀，不改程式） | 未開始 | - | - | 擋住 Phase 3、5 |
| 1 | Config：環境變數驗證 | 進行中 | 隔離編譯測試 15/15；npm test、npm run typecheck 尚未執行 | lumi/phase-1-config | 程式已新增；待在具備專案依賴的環境完成正式驗證 |
| 2 | Generation Manager / Scanner | 未開始 | - | - | |
| 3 | Event Schema / JSONL Reader | 未開始 | - | - | 需要 Phase 0 的結果 |
| 4 | Error Writer | 未開始 | - | - | 需要路徑解析（見待決定 #4） |
| 5 | Experimental Writer | 未開始 | - | - | 需要 Phase 0 的結果 |
| 6 | Archive Manager | 未開始 | - | - | |
| 7 | Lifecycle Controller / 整合 | 未開始 | - | - | 會動到 lumi-memory 等既有檔案 |

狀態只用這四種：未開始／進行中／完成（測試通過）／卡住（見待決定）

---

## 待我決定

（agent 遇到規格沒寫清楚的地方，列在這裡。我回答後，把答案移到 decisions.md。）

1. 四種事件的 payload 欄位 → 由 Phase 0 盤點現有程式後，我確認
2. Error Record 共同欄位 → 已決定採共同必填欄位、其餘依錯誤類型選填；共同必填欄位的精確清單仍待確認
3. Force shutdown 的人工操作介面形式與授權方式 → 已決定使用獨立人工操作介面；具體形式與授權方式於 Phase 7 前確認
4. Archive 搬移期間的同步策略／路徑解析器該放哪個 Phase → Phase 4 開始前決定
5. 規格 §9.3 模糊寫入時的檢查範圍（全檔掃描或只看尾端）
6. 規格 §12.1 正常關閉時，進行中的 append 要不要中斷
7. Phase 1 環境變數字串格式 → 已決定採嚴格十進位格式，只接受不含前導零、空白、正號、小數點或科學記號的正整數字串

---

## 已完成事項

（每個 Phase 完成後，agent 在此新增一行：日期、Phase、改了哪些檔案、跑了哪些測試）

- 尚無 Phase 完成；Phase 1 實作與正式專案測試仍進行中。

---

## 已知問題 / 尚未實作 / 尚未測試

- 本次執行環境沒有 DigitalIsland 的本機 checkout，也沒有 server/node_modules；嘗試從 GitHub clone 時，執行環境無法解析外部網域，因此無法安裝／使用專案內的 tsx 與套件依賴。
- 已將 Phase 1 測試以隔離方式使用全域 TypeScript 編譯，再由 Node.js node:test 執行，結果 15/15 通過；這不等同於在專案環境執行 cd server && npm test。
- npm run typecheck 尚未在專案環境執行。
- 尚未執行後端啟動整合測試，確認非法設定會在 HTTP server 開始 listen 前終止程序。
- Phase 0 及 Phase 2–7 均未開始；本次未修改其程式碼或規格。

---

## 給 agent 的更新規則

1. 每個 Phase 結束，必須更新上方「階段進度」「已完成事項」。
2. 只能在測試實際執行並通過後，才把狀態改成「完成」。
3. 遇到規格沒定義的內容，新增到「待我決定」，不要自行補完。
4. 不得修改規格文件與 decisions.md，除非我明確要求。
5. 回報時，分開寫「已確認的事實（附檔案路徑）」和「推論」。
