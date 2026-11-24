import "./DialogueBox.css";

type DialogueBoxProps = {
  collapsed: boolean;
  onToggle: () => void;
};

function DialogueBox({ collapsed, onToggle }: DialogueBoxProps) {
  return (
    <aside
      className={`dialogue-panel ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Lumi 對話框"
    >
      {collapsed ? (
        <button
          className="dialogue-toggle dialogue-toggle--collapsed"
          onClick={onToggle}
          aria-label="展開 Lumi 對話框"
          aria-expanded={false}
        >
          Lumi <span>›</span>
        </button>
      ) : (
        <section className="dialogue-box">
          <div className="dialogue-box__inner">
            <header className="dialogue-box__header">
              <div className="dialogue-box__name">Lumi</div>
              <div className="dialogue-box__record">觀察紀錄</div>
              <button
                className="dialogue-toggle"
                onClick={onToggle}
                aria-label="收合 Lumi 對話框"
                aria-expanded={true}
              >
                −
              </button>
            </header>

            <div className="dialogue-box__content">
              <h2>今天的島上很安靜。</h2>
              <p>我在附近發現了一塊看起來很好吃的肉田。</p>
            </div>

            <div className="dialogue-box__footer">
              <span className="dialogue-box__hint" aria-label="下一頁" />
            </div>
          </div>
        </section>
      )}
    </aside>
  );
}

export default DialogueBox;
