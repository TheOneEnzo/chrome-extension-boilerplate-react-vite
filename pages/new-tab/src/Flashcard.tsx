import { useState, useEffect } from 'react';

type TranslationItem = {
  id?: string;
  original: string;
  translation: string;
  date: string;
  url?: string;
};

type SiteGroup = {
  domain: string;
  url: string;
  translations: TranslationItem[];
  visible: boolean;
};

const Flashcards = () => {
  const [siteGroups, setSiteGroups] = useState<SiteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [reviewCards, setReviewCards] = useState<TranslationItem[]>([]);
  const [reviewSite, setReviewSite] = useState<string>('');
  const [isReversed, setIsReversed] = useState(false);
  const [dailyWords, setDailyWords] = useState<TranslationItem[]>([]);

  const loadDailyWords = () => {
    const today = new Date().toISOString().split('T')[0];

    chrome.storage.local.get({ translations: [] }, res => {
      const translations = res.translations as TranslationItem[];

      const todayTranslations = translations.filter(translation => {
        const translationDate = new Date(translation.date).toISOString().split('T')[0];
        return translationDate === today;
      });

      const formattedDailyWords = todayTranslations.map((translation, index) => ({
        original: translation.original,
        translation: translation.translation,
        date: new Date().toISOString(),
        url: 'daily-words',
        id: `daily-${index + 1}`,
      }));

      setDailyWords(formattedDailyWords);
    });
  };

  // Extract domain from URL
  const getDomain = (url: string): string => {
    try {
      if (!url || url.trim() === '') {
        return 'Unknown Site';
      }

      let processedUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
        processedUrl = 'https://' + url;
      }

      const urlObj = new URL(processedUrl);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      console.error('Error parsing URL:', url, error);
      if (url && url.includes('chrome-extension://')) {
        return 'Extension Pages';
      }
      if (url) {
        const domainMatch = url.match(/(?:https?:\/\/)?(?:www\.)?([^/:]+)/);
        if (domainMatch && domainMatch[1]) {
          return domainMatch[1];
        }
      }
      return 'Unknown Site';
    }
  };

  // Load translations from Chrome storage on mount
  useEffect(() => {
    const groupTranslationsBySite = (translations: TranslationItem[]): SiteGroup[] => {
      const groups: { [domain: string]: SiteGroup } = {};

      translations.forEach((translation, index) => {
        const translationWithId = { ...translation, id: translation.id || `translation-${index}` };
        const domain = translation.url ? getDomain(translation.url) : 'Unknown Site';

        let siteUrl = '#';
        if (translation.url && translation.url.trim() !== '') {
          if (translation.url.startsWith('http://') || translation.url.startsWith('https://')) {
            siteUrl = translation.url;
          } else if (!translation.url.includes('chrome-extension://')) {
            siteUrl = `https://${translation.url}`;
          }
        }

        if (!groups[domain]) {
          groups[domain] = {
            domain,
            url: siteUrl,
            translations: [],
            visible: true,
          };
        }

        groups[domain].translations.push(translationWithId);
      });

      return Object.values(groups).sort((a, b) => {
        const latestA = Math.max(...a.translations.map(t => new Date(t.date).getTime()));
        const latestB = Math.max(...b.translations.map(t => new Date(t.date).getTime()));
        return latestB - latestA;
      });
    };

    chrome.storage.local.get({ translations: [] }, res => {
      const translations = res.translations as TranslationItem[];
      const groups = groupTranslationsBySite(translations);

      loadDailyWords();

      if (dailyWords.length > 0) {
        const dailyGroup: SiteGroup = {
          domain: '📅 Daily Words',
          url: '#',
          translations: dailyWords,
          visible: true,
        };
        setSiteGroups([dailyGroup, ...groups]);
      } else {
        setSiteGroups(groups);
      }

      setLoading(false);
    });
  }, [dailyWords]);

  const handleDeleteCard = (siteIndex: number, cardId: string) => {
    if (siteGroups[siteIndex].domain === '📅 Daily Words') {
      alert('Daily words cannot be deleted manually. They refresh automatically.');
      return;
    }

    const newSiteGroups = [...siteGroups];
    newSiteGroups[siteIndex].translations = newSiteGroups[siteIndex].translations.filter(card => card.id !== cardId);

    const filteredGroups = newSiteGroups.filter(group => group.translations.length > 0);
    setSiteGroups(filteredGroups);

    const allTranslations = filteredGroups.flatMap(
      group => group.translations.map(({ ...rest }) => rest), // Removed unused id parameter
    );
    chrome.storage.local.set({ translations: allTranslations });
  };

  const handleDeleteSite = (siteIndex: number) => {
    if (siteGroups[siteIndex].domain === '📅 Daily Words') {
      alert('Daily words cannot be deleted. They refresh automatically.');
      return;
    }

    const siteDomain = siteGroups[siteIndex].domain;
    if (!confirm(`Delete all flashcards from ${siteDomain}?`)) return;

    const newSiteGroups = siteGroups.filter((_, index) => index !== siteIndex);
    setSiteGroups(newSiteGroups);

    const allTranslations = newSiteGroups.flatMap(
      group => group.translations.map(({ ...rest }) => rest), // Removed unused id parameter
    );
    chrome.storage.local.set({ translations: allTranslations });
  };

  const handleClearAll = () => {
    if (!confirm('Clear all saved translations?')) return;
    setSiteGroups([]);
    chrome.storage.local.set({ translations: [] });
  };

  const toggleSiteVisibility = (siteIndex: number) => {
    const newSiteGroups = [...siteGroups];
    newSiteGroups[siteIndex].visible = !newSiteGroups[siteIndex].visible;
    setSiteGroups(newSiteGroups);
  };

  const openSite = (url: string) => {
    if (url !== '#') {
      window.open(url, '_blank');
    }
  };

  const startReview = (siteDomain: string, cards: TranslationItem[]) => {
    setReviewMode(true);
    setReviewCards([...cards].sort(() => Math.random() - 0.5));
    setReviewSite(siteDomain);
    setCurrentCardIndex(0);
    setShowTranslation(false);
  };

  const closeReview = () => {
    setReviewMode(false);
    setReviewCards([]);
    setReviewSite('');
    setCurrentCardIndex(0);
    setShowTranslation(false);
    setIsReversed(false);
  };

  const nextCard = () => {
    if (currentCardIndex < reviewCards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setShowTranslation(false);
    } else {
      setReviewMode(false);
      alert(`Review completed for ${reviewSite}!`);
    }
  };

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1);
      setShowTranslation(false);
    }
  };

  const toggleTranslation = () => {
    setShowTranslation(!showTranslation);
  };

  const toggleLanguageDirection = () => {
    setIsReversed(!isReversed);
    setShowTranslation(false);
  };

  const getCurrentCardText = () => {
    const currentCard = reviewCards[currentCardIndex];
    if (!currentCard) return '';

    if (!showTranslation) {
      return isReversed ? currentCard.translation : currentCard.original;
    } else {
      return isReversed ? currentCard.original : currentCard.translation;
    }
  };

  const exportFlashcards = () => {
    const allTranslations = siteGroups
      .filter(group => group.domain !== '📅 Daily Words')
      .flatMap(group => group.translations.map(({ ...rest }) => rest)); // Removed unused id parameter

    const dataStr = JSON.stringify(allTranslations, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const exportFileDefaultName = 'flashcards-export.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importFlashcards = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const content = e.target?.result as string;
        const translations = JSON.parse(content) as TranslationItem[];

        if (Array.isArray(translations) && translations.every(t => t.original && t.translation && t.date)) {
          chrome.storage.local.get({ translations: [] }, res => {
            const existing = res.translations as TranslationItem[];
            const merged = [...existing, ...translations];

            const groupTranslationsBySite = (translations: TranslationItem[]): SiteGroup[] => {
              // ... same implementation as above
              const groups: { [domain: string]: SiteGroup } = {};
              translations.forEach((translation, index) => {
                const translationWithId = { ...translation, id: translation.id || `translation-${index}` };
                const domain = getDomain(translation.url || '');

                let siteUrl = '#';
                if (translation.url && translation.url.trim() !== '') {
                  if (translation.url.startsWith('http://') || translation.url.startsWith('https://')) {
                    siteUrl = translation.url;
                  } else if (!translation.url.includes('chrome-extension://')) {
                    siteUrl = `https://${translation.url}`;
                  }
                }

                if (!groups[domain]) {
                  groups[domain] = { domain, url: siteUrl, translations: [], visible: true };
                }

                groups[domain].translations.push(translationWithId);
              });

              return Object.values(groups).sort((a, b) => {
                const latestA = Math.max(...a.translations.map(t => new Date(t.date).getTime()));
                const latestB = Math.max(...b.translations.map(t => new Date(t.date).getTime()));
                return latestB - latestA;
              });
            };

            const groups = groupTranslationsBySite(merged);

            const dailyGroup = siteGroups.find(group => group.domain === '📅 Daily Words');
            if (dailyGroup) {
              setSiteGroups([dailyGroup, ...groups]);
            } else {
              setSiteGroups(groups);
            }

            chrome.storage.local.set({ translations: merged });
            alert(`Imported ${translations.length} flashcards successfully!`);
          });
        } else {
          alert('Invalid file format. Please import a valid flashcards export file.');
        }
      } catch (error) {
        alert('Error parsing file: ' + error);
      }
    };
    reader.readAsText(file);

    event.target.value = '';
  };

  const escapeHtml = (s: string) =>
    String(s).replace(
      /[&<>"']/g,
      m =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[m] || m,
    );

  const totalTranslations = siteGroups.reduce((sum, group) => sum + group.translations.length, 0);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, Arial',
        }}>
        <div>Loading your flashcards...</div>
      </div>
    );
  }

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, Arial' }}>
      {/* Review Mode Overlay */}
      {reviewMode && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
          <div
            style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '10px',
              maxWidth: '500px',
              width: '90%',
              textAlign: 'center',
              position: 'relative',
            }}>
            <button
              onClick={closeReview}
              style={{
                position: 'absolute',
                top: '15px',
                right: '15px',
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: '#666',
                lineHeight: '1',
                padding: '5px',
              }}
              title="Close review">
              ×
            </button>

            <div
              style={{
                position: 'absolute',
                top: '15px',
                left: '15px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
              <button
                onClick={toggleLanguageDirection}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={isReversed ? 'Switch to Translation → Original' : 'Switch to Original → Translation'}>
                🔄 {isReversed ? 'T→O' : 'O→T'}
              </button>
            </div>

            <h3 style={{ marginTop: '0' }}>Reviewing: {reviewSite}</h3>
            <p style={{ color: '#666', marginBottom: '10px' }}>
              Card {currentCardIndex + 1} of {reviewCards.length}
            </p>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '20px' }}>
              Mode: {isReversed ? 'Translation → Original' : 'Original → Translation'}
            </p>

            <div
              style={{
                minHeight: '150px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                marginBottom: '20px',
                padding: '20px',
                border: '1px solid #eee',
                borderRadius: '5px',
              }}>
              {getCurrentCardText()}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <button
                onClick={toggleTranslation}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#0d6efd',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginRight: '10px',
                }}>
                {showTranslation ? 'Show Front' : 'Show Back'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button
                onClick={prevCard}
                disabled={currentCardIndex === 0}
                style={{
                  padding: '10px 20px',
                  backgroundColor: currentCardIndex === 0 ? '#ccc' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: currentCardIndex === 0 ? 'not-allowed' : 'pointer',
                }}>
                Previous
              </button>

              <button
                onClick={nextCard}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}>
                {currentCardIndex === reviewCards.length - 1 ? 'Finish' : 'Next'}
              </button>

              <button
                onClick={closeReview}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}>
                Close Review
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header
        style={{
          borderBottom: '1px solid #e9ecef',
          backgroundColor: 'white',
          padding: '20px',
        }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>Your Flashcards by Website</h1>
              <p style={{ margin: 0, color: '#6c757d' }}>
                {totalTranslations} translations from {siteGroups.length} websites
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={exportFlashcards}
                disabled={totalTranslations === 0}
                style={{
                  padding: '8px 16px',
                  backgroundColor: totalTranslations === 0 ? '#e9ecef' : '#17a2b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: totalTranslations === 0 ? 'not-allowed' : 'pointer',
                  marginRight: '10px',
                }}>
                Export
              </button>

              <label
                htmlFor="import-file"
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#6f42c1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginRight: '10px',
                  display: 'inline-block',
                }}>
                Import
                <input
                  id="import-file"
                  type="file"
                  accept=".json"
                  onChange={importFlashcards}
                  style={{ display: 'none' }}
                />
              </label>

              <button
                onClick={handleClearAll}
                disabled={totalTranslations === 0}
                style={{
                  padding: '8px 16px',
                  backgroundColor: totalTranslations === 0 ? '#e9ecef' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: totalTranslations === 0 ? 'not-allowed' : 'pointer',
                }}>
                Clear All
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Sites and Flashcards */}
      <section style={{ padding: '40px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {siteGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    margin: '0 auto 16px',
                    backgroundColor: '#e9ecef',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                  }}>
                  📚
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>No flashcards yet</h3>
                <p style={{ color: '#6c757d', marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
                  Start highlighting and translating text on websites to build your personalized flashcard collection.
                </p>
                <button
                  onClick={() => window.close()}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#0d6efd',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}>
                  Start Translating
                </button>
              </div>
            </div>
          ) : (
            siteGroups.map((siteGroup, siteIndex) => (
              <div key={siteGroup.domain} style={{ marginBottom: '40px' }}>
                {/* Site Header */}
                <div
                  style={{
                    backgroundColor: 'white',
                    border: '1px solid #e9ecef',
                    borderRadius: '8px 8px 0 0',
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {siteGroup.domain === '📅 Daily Words' ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          backgroundColor: '#ffc107',
                          color: 'black',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        }}>
                        📅 Daily Words
                      </div>
                    ) : (
                      <button
                        onClick={() => openSite(siteGroup.url)}
                        disabled={siteGroup.url === '#'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 12px',
                          backgroundColor: siteGroup.url === '#' ? '#e9ecef' : '#0d6efd',
                          color: siteGroup.url === '#' ? '#6c757d' : 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: siteGroup.url === '#' ? 'not-allowed' : 'pointer',
                          fontSize: '14px',
                        }}>
                        🌐 {siteGroup.domain}
                      </button>
                    )}
                    <span style={{ color: '#6c757d', fontSize: '14px' }}>
                      {siteGroup.translations.length} translations
                      {siteGroup.domain === '📅 Daily Words' && (
                        <span style={{ color: '#856404', fontWeight: 'bold' }}> • Today</span>
                      )}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => startReview(siteGroup.domain, siteGroup.translations)}
                      disabled={siteGroup.translations.length === 0}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: siteGroup.translations.length === 0 ? '#e9ecef' : '#ffc107',
                        color: siteGroup.translations.length === 0 ? '#6c757d' : 'black',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: siteGroup.translations.length === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                      }}>
                      Review ({siteGroup.translations.length})
                    </button>
                    <button
                      onClick={() => toggleSiteVisibility(siteIndex)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: siteGroup.visible ? '#28a745' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}>
                      {siteGroup.visible ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => handleDeleteSite(siteIndex)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}>
                      Delete Site
                    </button>
                  </div>
                </div>

                {/* Flashcards Grid */}
                {siteGroup.visible && (
                  <div
                    style={{
                      backgroundColor: '#f8f9fa',
                      border: '1px solid #e9ecef',
                      borderTop: 'none',
                      borderRadius: '0 0 8px 8px',
                      padding: '20px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: '16px',
                    }}>
                    {siteGroup.translations.map(card => {
                      const date = new Date(card.date);
                      return (
                        <div
                          key={card.id}
                          style={{
                            position: 'relative',
                            backgroundColor: 'white',
                            border: '1px solid #e9ecef',
                            borderRadius: '6px',
                            padding: '16px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          }}>
                          {siteGroup.domain !== '📅 Daily Words' && (
                            <button
                              onClick={() => handleDeleteCard(siteIndex, card.id!)}
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                backgroundColor: '#dc3545',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '20px',
                                height: '20px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                              ×
                            </button>
                          )}

                          <div style={{ marginBottom: '12px' }}>
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#6c757d',
                                marginBottom: '6px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                              }}>
                              Original
                            </div>
                            <div
                              style={{
                                fontSize: '14px',
                                fontWeight: '600',
                                marginBottom: '10px',
                                lineHeight: '1.4',
                              }}>
                              {escapeHtml(card.original)}
                            </div>
                          </div>

                          <div style={{ marginBottom: '12px' }}>
                            <div
                              style={{
                                fontSize: '11px',
                                color: '#6c757d',
                                marginBottom: '6px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                              }}>
                              Translation
                            </div>
                            <div
                              style={{
                                fontSize: '14px',
                                color: '#0d6efd',
                                lineHeight: '1.4',
                              }}>
                              {escapeHtml(card.translation)}
                            </div>
                          </div>

                          <div
                            style={{
                              fontSize: '11px',
                              color: '#6c757d',
                              borderTop: '1px solid #e9ecef',
                              paddingTop: '10px',
                              marginTop: '10px',
                            }}>
                            {date.toLocaleDateString()} {date.toLocaleTimeString()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
};

export default Flashcards;
