import { useState, useRef, useCallback } from "react";

const RHYME_DB = {
  up:["cup","sup","pup","corrupt","erupt","abrupt","enough","tough","rough","love","above","shove","dove","of"],
  light:["night","right","fight","might","sight","write","white","bright","flight","tight","despite","ignite","unite","delight","invite","recite","excite","insight","tonight","alright"],
  free:["me","be","see","key","tree","agree","believe","receive","achieve","decree","victory","glory","story","before me","restore me","explore me"],
  grace:["face","place","race","space","chase","embrace","erase","replace","take my place","face to face","amazing grace"],
  fire:["higher","desire","inspire","require","entire","choir","wire","aspire","never tire","going higher","taking us higher"],
  name:["fame","claim","came","game","same","shame","flame","proclaim","reclaim","overcame","never the same","put to shame"],
  pain:["reign","gain","remain","explain","sustain","contain","maintain","refrain","in the rain","breaking chains","nothing to gain","power to reign"],
  broken:["spoken","token","woken","open","chosen","frozen","word was spoken","chains were broken","truth had spoken"],
  ground:["found","sound","around","profound","surround","astound","glory-bound","solid ground","lost and found","turnaround"],
  done:["one","son","run","won","begun","overcome","kingdom come","under the sun","chosen one","only Son"],
  word:["heard","stirred","deferred","assured","restored","occurred","every word","what I heard","make it heard"],
  soul:["whole","role","goal","scroll","control","console","made me whole","took its toll","beyond control","reaching my soul"],
  stand:["hand","land","planned","understand","promised land","helping hand","where I stand","by His hand","takes a stand"],
  alive:["strive","thrive","survive","arrive","revive","5","drive","come alive","truly alive","learning to thrive"],
  strong:["long","belong","song","wrong","along","prolong","all along","where I belong","been so long","make me strong"],
};

function getSyllables(text) {
  const word = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  let count = 0;
  let prevVowel = false;
  const vowels = "aeiouy";
  for (let i = 0; i < word.length; i++) {
    const isVowel = vowels.includes(word[i]);
    if (isVowel && !prevVowel) count++;
    prevVowel = isVowel;
  }
  if (word.endsWith("e") && count > 1) count--;
  if (word.endsWith("le") && !vowels.includes(word[word.length - 3])) count++;
  return Math.max(1, count);
}

function countBarSyllables(line) {
  return line.trim().split(/\s+/).reduce((sum, w) => sum + getSyllables(w.replace(/[^a-zA-Z]/g, "")), 0);
}

function getEndWord(line) {
  const words = line.trim().split(/\s+/);
  return words[words.length - 1]?.toLowerCase().replace(/[^a-z]/g, "") || "";
}

function findRhymes(word) {
  const w = word.toLowerCase();
  if (RHYME_DB[w]) return RHYME_DB[w];
  for (const [key, vals] of Object.entries(RHYME_DB)) {
    if (vals.includes(w)) return [key, ...vals.filter(v => v !== w)].slice(0, 8);
  }
  const endings = [w.slice(-3), w.slice(-2)];
  const found = [];
  for (const [key, vals] of Object.entries(RHYME_DB)) {
    if (endings.some(e => key.endsWith(e) || vals.some(v => v.endsWith(e)))) {
      found.push(key, ...vals);
    }
  }
  return [...new Set(found)].slice(0, 8);
}

function detectScheme(bars) {
  const endWords = bars.map(b => getEndWord(b.text));
  const groups = {};
  let nextLabel = 65;
  const labels = endWords.map(w => {
    if (!w) return "-";
    const existing = Object.entries(groups).find(([, words]) =>
      words.some(rw => findRhymes(w).includes(rw) || findRhymes(rw).includes(w) || rw === w)
    );
    if (existing) { groups[existing[0]].push(w); return existing[0]; }
    const label = String.fromCharCode(nextLabel++);
    groups[label] = [w]; return label;
  });
  return labels;
}

function detectInternalRhymes(line) {
  const words = line.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, ""));
  const pairs = [];
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 2; j < words.length; j++) {
      const rhymes = findRhymes(words[i]);
      if (rhymes.includes(words[j]) || (words[i].slice(-2) === words[j].slice(-2) && words[i].length > 2)) {
        pairs.push([words[i], words[j]]);
      }
    }
  }
  return pairs.slice(0, 3);
}

const SCRIPTURE_MAP = {
  grace: ["Ephesians 2:8–9", "2 Corinthians 12:9"],
  strength: ["Philippians 4:13", "Isaiah 40:31"],
  light: ["John 8:12", "Psalm 27:1"],
  love: ["Romans 8:38–39", "1 John 4:19"],
  faith: ["Hebrews 11:1", "Romans 10:17"],
  hope: ["Romans 15:13", "Jeremiah 29:11"],
  victory: ["1 Corinthians 15:57", "Romans 8:37"],
  broken: ["Psalm 34:18", "Isaiah 61:1"],
  free: ["John 8:36", "Galatians 5:1"],
  fire: ["Jeremiah 20:9", "Acts 2:3"],
  peace: ["Philippians 4:7", "Isaiah 26:3"],
  worthy: ["Revelation 5:12", "Psalm 18:3"],
};

function detectScriptures(line) {
  const lower = line.toLowerCase();
  const found = [];
  for (const [keyword, verses] of Object.entries(SCRIPTURE_MAP)) {
    if (lower.includes(keyword)) found.push(...verses);
  }
  return [...new Set(found)].slice(0, 2);
}

function parseBars(raw) {
  return raw.split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("//") && !line.startsWith("#"))
    .map((text, i) => {
      const clean = text.replace(/^\d+[\.\)]\s*/, "").replace(/\[.*?\]/g, "").trim();
      return {
        id: i,
        text: clean,
        syllables: countBarSyllables(clean),
        endWord: getEndWord(clean),
        internalRhymes: detectInternalRhymes(clean),
        scriptures: detectScriptures(clean),
      };
    });
}

const SCHEMES = {
  "AABB": "Couplets — bars 1&2 rhyme, 3&4 rhyme. Classic rap flow.",
  "ABAB": "Alternating — bar 1 rhymes with 3, bar 2 rhymes with 4. More musical.",
  "ABCB": "Ballad — only bars 2 and 4 rhyme. Gives breathing room.",
  "AAAA": "Monorhyme — all 4 bars share one rhyme. High difficulty, big impact.",
  "ABBA": "Enclosed — bars 1&4 rhyme, bars 2&3 rhyme. Layered feel.",
};

const FLOWS = {
  "straight": "One syllable per 8th note. Classic Lecrae, KB style.",
  "double-time": "Two syllables per beat. Flows twice as fast. Andy Mineo style.",
  "triplet": "Three syllables per beat. Creates a rolling, melodic feel.",
  "syncopated": "Hits fall between beats. Off-beat emphasis, modern gospel rap.",
};

export default function AICoPilot() {
  const [mode, setMode] = useState("generate");
  const [prompt, setPrompt] = useState("");
  const [ghostLines, setGhostLines] = useState(["", ""]);
  const [bars, setBars] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scheme, setScheme] = useState("AABB");
  const [flow, setFlow] = useState("straight");
  const [barCount, setBarCount] = useState(16);
  const [bpm, setBpm] = useState(90);
  const [theme, setTheme] = useState("redemption");
  const [scripture, setScripture] = useState("");
  const [styleVocab, setStyleVocab] = useState("street");
  const [selectedBar, setSelectedBar] = useState(null);
  const [rhymeSuggestions, setRhymeSuggestions] = useState([]);
  const [activeTab, setActiveTab] = useState("write");
  const schemeLabels = bars.length ? detectScheme(bars) : [];

  const buildSystemPrompt = () => `
You are a professional gospel rap lyricist and ghostwriter. You have mastered the craft of artists like Lecrae, KB, Andy Mineo, Trip Lee, and Derek Minor.

CORE RULES — follow every one, no exceptions:
1. Write exactly ${barCount} bars unless the user specifies otherwise
2. Use rhyme scheme ${scheme} consistently throughout (${SCHEMES[scheme]})
3. Flow style: ${flow} (${FLOWS[flow]})
4. Target BPM: ${bpm} — syllables per bar should reflect this tempo
5. Vocabulary level: ${styleVocab} — ${styleVocab === "street" ? "raw, authentic street language mixed with theology" : styleVocab === "elevated" ? "sophisticated, poetic, literary vocabulary" : "accessible, everyday language anyone can understand"}
6. Theme: ${theme}
7. ${scripture ? `Feature this scripture naturally: ${scripture}` : "Reference at least one scripture naturally — don't force it"}

CRAFT REQUIREMENTS:
- Every bar must have 10–16 syllables for ${flow} flow at ${bpm} BPM
- End rhymes must be TRUE rhymes (not slant unless labeled [SLANT])
- Include internal rhymes within bars where possible — mark with [INT]
- Never use clichés: "I'm on fire for God", "God is good all the time" as filler
- Theology must be accurate — don't twist scripture
- Each bar should push the narrative forward — no filler lines
- Bars 8 and 16 should land the hardest (punchlines or turning points)

OUTPUT FORMAT — return ONLY this JSON, no other text:
{
  "bars": [
    {
      "number": 1,
      "text": "bar text here",
      "syllables": 13,
      "endWord": "word",
      "rhymeGroup": "A",
      "hasInternalRhyme": true,
      "scripture": null
    }
  ],
  "scheme": "${scheme}",
  "theme": "${theme}",
  "suggestedFlow": "note about flow",
  "craftNotes": "brief note about what makes this verse work"
}`;

  const buildGhostPrompt = () => `
You are a professional gospel rap ghostwriter completing bars for an artist.

The artist has written these bars and you must complete the gaps:
Bar 1: "${ghostLines[0]}"
Bar 2: [YOU WRITE THIS]
Bar 3: "${ghostLines[1]}"  
Bar 4: [YOU WRITE THIS]

RULES:
- Match the EXACT syllable count of the artist's bars
- Match their vocabulary and voice — don't sound like a different person
- Bar 2 end word must rhyme with bar 1: "${getEndWord(ghostLines[0])}"
- Bar 4 end word must rhyme with bar 3: "${getEndWord(ghostLines[1])}"
- Keep the theme consistent: ${theme}
- Flow: ${flow}

OUTPUT FORMAT — return ONLY this JSON:
{
  "bar2": { "text": "completed bar", "syllables": 0, "endWord": "", "rhymesWith": "${getEndWord(ghostLines[0])}" },
  "bar4": { "text": "completed bar", "syllables": 0, "endWord": "", "rhymesWith": "${getEndWord(ghostLines[1])}" },
  "note": "brief note about how you matched their voice"
}`;

  const callClaude = async (userMsg, systemMsg) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: systemMsg,
        messages: [{ role: "user", content: userMsg }],
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.content?.[0]?.text || "";
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError(""); setBars([]);
    try {
      const raw = await callClaude(prompt, buildSystemPrompt());
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const enriched = parsed.bars.map(b => ({
        ...b,
        internalRhymes: detectInternalRhymes(b.text),
        scriptures: detectScriptures(b.text),
      }));
      setBars(enriched);
      setActiveTab("write");
    } catch (e) {
      setError("Generation failed — " + e.message);
    }
    setLoading(false);
  };

  const ghostWrite = async () => {
    if (!ghostLines[0].trim() || !ghostLines[1].trim()) return;
    setLoading(true); setError("");
    try {
      const raw = await callClaude("Complete my bars", buildGhostPrompt());
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      const newBars = parseBars(
        `${ghostLines[0]}\n${parsed.bar2.text}\n${ghostLines[1]}\n${parsed.bar4.text}`
      );
      setBars(newBars);
      setActiveTab("write");
    } catch (e) {
      setError("Ghost write failed — " + e.message);
    }
    setLoading(false);
  };

  const rewriteBar = async (bar) => {
    setLoading(true);
    try {
      const sys = `You are a gospel rap lyricist. Rewrite this single bar to be more powerful while:
- Keeping exactly ${bar.syllables} syllables
- Keeping the end rhyme word: "${bar.endWord}" or a rhyme with it
- Matching flow: ${flow}
- Theme: ${theme}
Return ONLY the new bar text, nothing else.`;
      const newText = await callClaude(`Rewrite this bar: "${bar.text}"`, sys);
      setBars(prev => prev.map(b =>
        b.id === bar.id ? { ...b, text: newText.trim(), internalRhymes: detectInternalRhymes(newText), scriptures: detectScriptures(newText) } : b
      ));
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const selectBar = (bar) => {
    setSelectedBar(bar);
    setRhymeSuggestions(findRhymes(bar.endWord).slice(0, 10));
  };

  const syllableColor = (n) => {
    if (n >= 10 && n <= 16) return "#1D9E75";
    if (n >= 8 && n <= 18) return "#EF9F27";
    return "#E24B4A";
  };

  const schemeColor = (label) => {
    const colors = { A: "#534AB7", B: "#993556", C: "#0F6E56", D: "#854F0B", "-": "#888" };
    return colors[label] || "#888";
  };

  const exportLyrics = () => {
    const text = bars.map((b, i) => `${i + 1}. ${b.text}`).join("\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <div style={{ padding: 16, maxWidth: 760, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>AI Co-Pilot</h2>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>Gospel rap lyric intelligence — real rhyme logic + Claude AI</p>
        </div>
        {bars.length > 0 && (
          <button onClick={exportLyrics} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-border-secondary)", background: "transparent", cursor: "pointer", color: "var(--color-text-secondary)" }}>
            Copy lyrics
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--color-border-tertiary)", paddingBottom: 0 }}>
        {["write", "settings", "rhymes"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ fontSize: 12, padding: "6px 14px", borderRadius: "8px 8px 0 0", border: "1px solid var(--color-border-tertiary)", borderBottom: activeTab === t ? "1px solid var(--color-background-primary)" : "none", background: activeTab === t ? "var(--color-background-primary)" : "var(--color-background-secondary)", color: activeTab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)", cursor: "pointer", marginBottom: activeTab === t ? -1 : 0 }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 500 }}>Structure</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Bars</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[8, 12, 16, 24].map(n => (
                      <button key={n} onClick={() => setBarCount(n)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: `1px solid ${barCount === n ? "#534AB7" : "var(--color-border-secondary)"}`, background: barCount === n ? "#534AB722" : "transparent", color: barCount === n ? "#534AB7" : "var(--color-text-secondary)", cursor: "pointer" }}>{n}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>BPM</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="range" min={60} max={160} value={bpm} onChange={e => setBpm(Number(e.target.value))} style={{ width: 80 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, minWidth: 32 }}>{bpm}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
              <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 500 }}>Voice</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Vocab</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["street", "elevated", "accessible"].map(v => (
                      <button key={v} onClick={() => setStyleVocab(v)} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, border: `1px solid ${styleVocab === v ? "#993556" : "var(--color-border-secondary)"}`, background: styleVocab === v ? "#99355622" : "transparent", color: styleVocab === v ? "#993556" : "var(--color-text-secondary)", cursor: "pointer" }}>{v}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Theme</span>
                  <select value={theme} onChange={e => setTheme(e.target.value)} style={{ fontSize: 12, padding: "3px 6px" }}>
                    {["redemption","identity","perseverance","faith","love","warfare","testimony","worship","purpose","grace"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 500 }}>Rhyme scheme</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(SCHEMES).map(([s, desc]) => (
                <div key={s} onClick={() => setScheme(s)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, border: `1px solid ${scheme === s ? "#534AB7" : "var(--color-border-tertiary)"}`, background: scheme === s ? "#534AB708" : "transparent", cursor: "pointer" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#534AB7", minWidth: 36 }}>{s}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 500 }}>Flow style</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(FLOWS).map(([f, desc]) => (
                <div key={f} onClick={() => setFlow(f)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, border: `1px solid ${flow === f ? "#0F6E56" : "var(--color-border-tertiary)"}`, background: flow === f ? "#0F6E5608" : "transparent", cursor: "pointer" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#0F6E56", minWidth: 80 }}>{f}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 500 }}>Scripture to feature (optional)</p>
            <input value={scripture} onChange={e => setScripture(e.target.value)} placeholder="e.g. Isaiah 54:17 or Ephesians 6" style={{ width: "100%", fontSize: 12, padding: "6px 10px", boxSizing: "border-box" }} />
          </div>
        </div>
      )}

      {activeTab === "rhymes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500 }}>Rhyme finder</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="rhyme-input" placeholder="Type a word..." style={{ flex: 1, fontSize: 12, padding: "6px 10px" }} onKeyDown={e => { if (e.key === "Enter") setRhymeSuggestions(findRhymes(e.target.value)); }} />
              <button onClick={() => { const v = document.getElementById("rhyme-input").value; setRhymeSuggestions(findRhymes(v)); }} style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #534AB7", background: "#534AB711", color: "#534AB7", cursor: "pointer" }}>Find rhymes</button>
            </div>
            {rhymeSuggestions.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {rhymeSuggestions.map(r => (
                  <span key={r} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, border: "1px solid #534AB744", background: "#534AB711", color: "#534AB7" }}>{r}</span>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500 }}>Syllable counter</p>
            <textarea placeholder="Paste a bar to count syllables..." rows={2} style={{ width: "100%", fontSize: 12, padding: "6px 10px", boxSizing: "border-box", resize: "vertical" }} onChange={e => {
              const n = countBarSyllables(e.target.value);
              document.getElementById("syl-count").textContent = n + " syllables";
              document.getElementById("syl-count").style.color = syllableColor(n);
            }} />
            <span id="syl-count" style={{ fontSize: 13, fontWeight: 500 }}>0 syllables</span>
          </div>

          <div style={{ padding: "12px 14px", border: "1px solid var(--color-border-tertiary)", borderRadius: 10 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500 }}>Scripture suggestions by keyword</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(SCRIPTURE_MAP).slice(0, 8).map(([kw, verses]) => (
                <div key={kw} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontSize: 11, color: "#534AB7", minWidth: 70, fontWeight: 500 }}>{kw}</span>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{verses.join(" · ")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "write" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
            {["generate", "ghost"].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 20, border: `1px solid ${mode === m ? "#534AB7" : "var(--color-border-secondary)"}`, background: mode === m ? "#534AB722" : "transparent", color: mode === m ? "#534AB7" : "var(--color-text-secondary)", cursor: "pointer" }}>
                {m === "generate" ? "Generate verse" : "Ghost write mode"}
              </button>
            ))}
          </div>

          {mode === "generate" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={`Describe what you want — e.g. "A 16-bar verse about overcoming childhood pain through faith, referencing Isaiah 54:17, with a punchline on bar 16"`} rows={3} style={{ width: "100%", fontSize: 13, padding: "10px 12px", boxSizing: "border-box", resize: "vertical", borderRadius: 8 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Redemption arc with a punchline on bar 16", "Warfare verse — Ephesians 6 armor of God", "Identity verse — who I am in Christ", "Testimony — from the streets to the kingdom"].map(s => (
                  <button key={s} onClick={() => setPrompt(s)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, border: "1px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>{s}</button>
                ))}
              </div>
              <button onClick={generate} disabled={loading || !prompt.trim()} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: loading ? "var(--color-background-secondary)" : "#534AB7", color: loading ? "var(--color-text-secondary)" : "#fff", fontWeight: 500, fontSize: 13, cursor: loading ? "default" : "pointer" }}>
                {loading ? "Writing bars..." : `Generate ${barCount}-bar verse →`}
              </button>
            </div>
          )}

          {mode === "ghost" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>Write bars 1 and 3 — AI completes bars 2 and 4 to match your voice and rhyme scheme.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#534AB7", minWidth: 40, fontWeight: 500 }}>Bar 1</span>
                  <input value={ghostLines[0]} onChange={e => setGhostLines([e.target.value, ghostLines[1]])} placeholder="Write your first bar..." style={{ flex: 1, fontSize: 13, padding: "7px 10px" }} />
                  <span style={{ fontSize: 10, color: syllableColor(countBarSyllables(ghostLines[0])), minWidth: 24 }}>{countBarSyllables(ghostLines[0])}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#993556", minWidth: 40, fontWeight: 500 }}>Bar 2</span>
                  <div style={{ flex: 1, padding: "7px 10px", background: "var(--color-background-secondary)", borderRadius: 6, fontSize: 13, color: "var(--color-text-tertiary)", border: "1px dashed var(--color-border-tertiary)" }}>AI completes this to rhyme with bar 1</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#534AB7", minWidth: 40, fontWeight: 500 }}>Bar 3</span>
                  <input value={ghostLines[1]} onChange={e => setGhostLines([ghostLines[0], e.target.value])} placeholder="Write your third bar..." style={{ flex: 1, fontSize: 13, padding: "7px 10px" }} />
                  <span style={{ fontSize: 10, color: syllableColor(countBarSyllables(ghostLines[1])), minWidth: 24 }}>{countBarSyllables(ghostLines[1])}</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#993556", minWidth: 40, fontWeight: 500 }}>Bar 4</span>
                  <div style={{ flex: 1, padding: "7px 10px", background: "var(--color-background-secondary)", borderRadius: 6, fontSize: 13, color: "var(--color-text-tertiary)", border: "1px dashed var(--color-border-tertiary)" }}>AI completes this to rhyme with bar 3</div>
                </div>
              </div>
              <button onClick={ghostWrite} disabled={loading || !ghostLines[0].trim() || !ghostLines[1].trim()} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: loading ? "var(--color-background-secondary)" : "#993556", color: loading ? "var(--color-text-secondary)" : "#fff", fontWeight: 500, fontSize: 13, cursor: loading ? "default" : "pointer" }}>
                {loading ? "Matching your voice..." : "Complete my bars →"}
              </button>
            </div>
          )}

          {error && <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--color-background-danger)", color: "var(--color-text-danger)", fontSize: 12 }}>{error}</div>}

          {bars.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 8, padding: "6px 12px", background: "var(--color-background-secondary)", borderRadius: 8, fontSize: 11, color: "var(--color-text-secondary)" }}>
                <span>Scheme: <strong style={{ color: "var(--color-text-primary)" }}>{scheme}</strong></span>
                <span>Flow: <strong style={{ color: "var(--color-text-primary)" }}>{flow}</strong></span>
                <span>BPM: <strong style={{ color: "var(--color-text-primary)" }}>{bpm}</strong></span>
                <span>{bars.length} bars</span>
              </div>
              {bars.map((bar, i) => (
                <div key={bar.id ?? i} onClick={() => selectBar(bar)} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, border: `1px solid ${selectedBar?.id === bar.id ? "#534AB744" : "var(--color-border-tertiary)"}`, background: selectedBar?.id === bar.id ? "#534AB708" : "transparent", cursor: "pointer", transition: "all 0.1s" }}>
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)", minWidth: 20, paddingTop: 2 }}>{i + 1}</span>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: schemeColor(schemeLabels[i]), display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#fff", flexShrink: 0, marginTop: 2 }}>{schemeLabels[i]}</span>
                  <span style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>{bar.text}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: syllableColor(bar.syllables) }}>{bar.syllables}s</span>
                    {bar.internalRhymes?.length > 0 && <span style={{ fontSize: 9, color: "#0F6E56", background: "#0F6E5611", padding: "1px 5px", borderRadius: 4 }}>INT</span>}
                    {bar.scriptures?.length > 0 && <span style={{ fontSize: 9, color: "#854F0B", background: "#854F0B11", padding: "1px 5px", borderRadius: 4 }}>REF</span>}
                  </div>
                </div>
              ))}

              {selectedBar && (
                <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid #534AB744", borderRadius: 10, background: "#534AB705" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>Bar {(selectedBar.id ?? 0) + 1} inspector</span>
                    <button onClick={() => rewriteBar(selectedBar)} disabled={loading} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "1px solid #534AB7", background: "#534AB711", color: "#534AB7", cursor: "pointer" }}>Rewrite this bar</button>
                  </div>
                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--color-text-secondary)", flexWrap: "wrap" }}>
                    <span>End word: <strong style={{ color: "var(--color-text-primary)" }}>{selectedBar.endWord}</strong></span>
                    <span>Syllables: <strong style={{ color: syllableColor(selectedBar.syllables) }}>{selectedBar.syllables}</strong></span>
                    {selectedBar.internalRhymes?.length > 0 && <span>Internal rhymes: <strong style={{ color: "#0F6E56" }}>{selectedBar.internalRhymes.map(p => p.join("↔")).join(", ")}</strong></span>}
                    {selectedBar.scriptures?.length > 0 && <span>Scripture ref: <strong style={{ color: "#854F0B" }}>{selectedBar.scriptures.join(", ")}</strong></span>}
                  </div>
                  {rhymeSuggestions.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>Rhymes with "{selectedBar.endWord}": </span>
                      <span style={{ fontSize: 11, color: "#534AB7" }}>{rhymeSuggestions.slice(0, 8).join(", ")}</span>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ color: "#1D9E75" }}>● 10–16 syllables (on flow)</span>
                  <span style={{ color: "#EF9F27" }}>● 8–18 syllables (close)</span>
                  <span style={{ color: "#E24B4A" }}>● outside range</span>
                  <span style={{ color: "#0F6E56" }}>INT = internal rhyme</span>
                  <span style={{ color: "#854F0B" }}>REF = scripture reference</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
