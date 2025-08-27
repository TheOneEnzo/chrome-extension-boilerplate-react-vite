import { useState, useEffect } from "react";

type TranslationItem = {
  id?: string;
  original: string;
  translation: string;
  date: string;
  url?: string;
};

const Flashcards = () => {
  const [flashcards, setFlashcards] = useState<TranslationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Load translations from Chrome storage on mount
  useEffect(() => {
    chrome.storage.local.get({ translations: [] }, (res) => {
      const translations = res.translations as TranslationItem[];
      // Add IDs if they don't exist
      const flashcardsWithIds = translations.map((item, index) => ({
        ...item,
        id: item.id || `translation-${index}`,
      }));
      setFlashcards(flashcardsWithIds);
      setLoading(false);
    });
  }, []);

  const handleDeleteCard = (id: string) => {
    const newFlashcards = flashcards.filter(card => card.id !== id);
    setFlashcards(newFlashcards);
    
    // Update Chrome storage
    const storageData = newFlashcards.map(({id, ...rest}) => rest);
    chrome.storage.local.set({ translations: storageData });
  };

  const handleClearAll = () => {
    if (!confirm("Clear all saved translations?")) return;
    setFlashcards([]);
    chrome.storage.local.set({ translations: [] });
  };

  const escapeHtml = (s: string) =>
    String(s).replace(/[&<>"']/g, (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[m] || m)
    );

  if (loading) {
    return (
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        fontFamily: "system-ui, Arial"
      }}>
        <div>Loading your flashcards...</div>
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f8f9fa", fontFamily: "system-ui, Arial" }}>
      {/* Header */}
      <header style={{ 
        borderBottom: "1px solid #e9ecef", 
        backgroundColor: "white",
        padding: "20px"
      }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ margin: "0 0 8px 0", fontSize: "24px", fontWeight: "bold" }}>
                Your Flashcards
              </h1>
              <p style={{ margin: 0, color: "#6c757d" }}>
                {flashcards.length} saved translations
              </p>
            </div>
            
            <button
              onClick={handleClearAll}
              disabled={flashcards.length === 0}
              style={{
                padding: "8px 16px",
                backgroundColor: flashcards.length === 0 ? "#e9ecef" : "#dc3545",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: flashcards.length === 0 ? "not-allowed" : "pointer"
              }}
            >
              Clear All
            </button>
          </div>
        </div>
      </header>

      {/* Flashcards Grid */}
      <section style={{ padding: "40px 20px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          {flashcards.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ marginBottom: "16px" }}>
                <div style={{
                  width: "64px",
                  height: "64px",
                  margin: "0 auto 16px",
                  backgroundColor: "#e9ecef",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  📚
                </div>
                <h3 style={{ fontSize: "20px", fontWeight: "600", marginBottom: "8px" }}>
                  No flashcards yet
                </h3>
                <p style={{ color: "#6c757d", marginBottom: "24px", maxWidth: "400px", margin: "0 auto 24px" }}>
                  Start highlighting and translating text on websites to build your personalized flashcard collection.
                </p>
                <button
                  onClick={() => window.close()}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: "#0d6efd",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer"
                  }}
                >
                  Start Translating
                </button>
              </div>
            </div>
          ) : (
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", 
              gap: "20px" 
            }}>
              {flashcards.map((card) => {
                const date = new Date(card.date);
                return (
                  <div
                    key={card.id}
                    style={{
                      position: "relative",
                      backgroundColor: "white",
                      border: "1px solid #e9ecef",
                      borderRadius: "8px",
                      padding: "20px",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                    }}
                  >
                    <button
                      onClick={() => handleDeleteCard(card.id!)}
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        backgroundColor: "#dc3545",
                        color: "white",
                        border: "none",
                        borderRadius: "50%",
                        width: "24px",
                        height: "24px",
                        cursor: "pointer",
                        fontSize: "12px"
                      }}
                    >
                      ✖
                    </button>
                    
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#6c757d", 
                        marginBottom: "8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        Original
                      </div>
                      <div style={{ 
                        fontSize: "16px", 
                        fontWeight: "600",
                        marginBottom: "12px",
                        lineHeight: "1.4"
                      }}>
                        {escapeHtml(card.original)}
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: "12px" }}>
                      <div style={{ 
                        fontSize: "12px", 
                        color: "#6c757d", 
                        marginBottom: "8px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px"
                      }}>
                        Translation
                      </div>
                      <div style={{ 
                        fontSize: "16px", 
                        color: "#0d6efd",
                        lineHeight: "1.4"
                      }}>
                        {escapeHtml(card.translation)}
                      </div>
                    </div>
                    
                    <div style={{ 
                      fontSize: "12px", 
                      color: "#6c757d", 
                      borderTop: "1px solid #e9ecef",
                      paddingTop: "12px",
                      marginTop: "12px"
                    }}>
                      {date.toLocaleString()}
                      {card.url && (
                        <div style={{ marginTop: "4px", wordBreak: "break-all" }}>
                          {escapeHtml(card.url)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default Flashcards;