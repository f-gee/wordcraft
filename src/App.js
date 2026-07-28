import React, { useState } from 'react';
import './App.css';

const combineWordsWithGemini = async (word1, word2, apiKey) => {
  const prompt = `You are the master alchemy engine for an elemental crafting game like Infinite Craft.
Combine these two inputs: "${word1}" and "${word2}".
Provide a logical, creative, and single-word (or very short phrase) result that represents their combined reaction.

Respond ONLY with a JSON object in this exact format:
{
  "result": "combined_word"
}

Do not write any markdown code blocks, explanations, or text outside of the raw JSON object.`;

  // Updated model endpoint path to use the active gemini-3.5-flash model
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('No response received from Gemini.');

  const parsed = JSON.parse(rawText.trim());
  if (!parsed.result) throw new Error('Response JSON format was invalid.');

  return parsed.result.toLowerCase().trim();
};


export default function App() {
  const [discoveredWords, setDiscoveredWords] = useState(['water', 'fire', 'earth', 'air']);
  const [workspaceItems, setWorkspaceItems] = useState([]);
  const [toast, setToast] = useState(null);
  const [geminiApiKey, setGeminiApiKey] = useState(
    localStorage.getItem('gemini_api_key') || ''
  );

  const triggerToast = (msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const handleApiKeyChange = (e) => {
    const val = e.target.value;
    setGeminiApiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  const handleDragStartFromBank = (e, word) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'bank', text: word }));
  };

  const handleDragStartFromWorkspace = (e, itemId) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ source: 'workspace', id: itemId }));
  };

  const handleDropOnWorkspace = (e) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;
    const data = JSON.parse(dataStr);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 50;
    const y = e.clientY - rect.top - 20;

    if (data.source === 'bank') {
      const newItem = {
        id: Date.now().toString(),
        text: data.text,
        x: Math.max(10, x),
        y: Math.max(10, y),
        isCrafting: false,
      };
      setWorkspaceItems((prev) => [...prev, newItem]);
    } else if (data.source === 'workspace') {
      setWorkspaceItems((prev) =>
        prev.map((item) => (item.id === data.id ? { ...item, x, y } : item))
      );
    }
  };

  const handleDropOnRightPanel = (e) => {
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;
    const data = JSON.parse(dataStr);

    if (data.source === 'workspace') {
      setWorkspaceItems((prev) => prev.filter((item) => item.id !== data.id));
    }
  };

  const handleDropOnItem = async (e, targetId) => {
    e.stopPropagation();
    e.preventDefault();
    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;
    const data = JSON.parse(dataStr);

    if (!geminiApiKey) {
      triggerToast('⚠️ Crafting blocked! Please input a valid Gemini API Key in the side panel first.');
      return;
    }

    const targetItem = workspaceItems.find((item) => item.id === targetId);
    if (!targetItem || targetItem.isCrafting) return;

    let sourceText = '';

    if (data.source === 'bank') {
      sourceText = data.text;
    } else if (data.source === 'workspace') {
      if (data.id === targetId) return;
      const sourceItem = workspaceItems.find((item) => item.id === data.id);
      if (!sourceItem) return;
      sourceText = sourceItem.text;
    }

    // Capture the entire state BEFORE making changes, to act as a rollback checkpoint
    const backupState = [...workspaceItems];

    // 1. Instantly transition target to crafting state, and temporarily remove the dragged item
    setWorkspaceItems((prev) =>
      prev
        .map((item) => (item.id === targetId ? { ...item, text: '🌀 Crafting...', isCrafting: true } : item))
        .filter((item) => item.id !== data.id)
    );

    try {
      // 2. Fetch combination from Gemini
      const newWord = await combineWordsWithGemini(sourceText, targetItem.text, geminiApiKey);

      // 3. On success, replace the target element with the newly crafted word
      setWorkspaceItems((prev) =>
        prev.map((item) =>
          item.id === targetId ? { ...item, text: newWord, isCrafting: false } : item
        )
      );

      // Add to discovered sidebar list
      setDiscoveredWords((prev) => {
        if (!prev.includes(newWord)) {
          return [...prev, newWord];
        }
        return prev;
      });

    } catch (err) {
      console.error('Crafting Transaction Failed:', err);
      // 4. Roll back to original board layout upon error and alert the player
      setWorkspaceItems(backupState);
      triggerToast(`❌ Fusion failed! The elements resisted combining. (${err.message})`);
    }
  };

  return (
    <div className="container">
      {toast && <div className="toast">{toast}</div>}

      {/* Left Panel: Sandbox Workspace */}
      <div
        className="left-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnWorkspace}
      >
        <h3 className="panel-title">Workspace</h3>
        <span className="helper-text">Drop elements together to craft, or drag active elements here to move them.</span>

        {workspaceItems.map((item) => (
          <div
            key={item.id}
            draggable={!item.isCrafting}
            onDragStart={(e) => handleDragStartFromWorkspace(e, item.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropOnItem(e, item.id)}
            className={`word-box workspace-item ${item.isCrafting ? 'crafting' : ''}`}
            style={{
              position: 'absolute',
              left: item.x,
              top: item.y,
            }}
          >
            {item.text}
          </div>
        ))}
      </div>

      {/* Right Panel: Word Bank & Configuration */}
      <div
        className="right-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnRightPanel}
      >
        <div className="api-key-container">
          <label className="api-key-label">Gemini API Key</label>
          <input
            type="password"
            placeholder="Paste your API key here..."
            value={geminiApiKey}
            onChange={handleApiKeyChange}
            className="api-key-input"
          />
          <span className="api-key-tip">
            Stored locally in your browser. Get yours from Google AI Studio.
          </span>
        </div>

        <h3 className="panel-title">Discovered Words</h3>
        <span className="helper-text">Total discovered: {discoveredWords.length}</span>
        <div className="word-grid">
          {discoveredWords.map((word) => (
            <div
              key={word}
              draggable
              onDragStart={(e) => handleDragStartFromBank(e, word)}
              className="word-box bank-item"
            >
              {word}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
