/* Quiz Studio: data contract and practice engine. MIT. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuizCore = api;
})(globalThis, function () {
  'use strict';
  const VERSION = 1;
  const TYPES = ['single', 'multi', 'text'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id) && id !== 'prototype' && !Object.hasOwn(Object.prototype,id);
  const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const renderRich = value => escapeHTML(value).replace(/&lt;(\/?)(br|p|strong|b|em|i|ul|ol|li)\s*\/?&gt;/gi,(_,slash,tag)=>'<'+slash+tag.toLowerCase()+'>');
  function uid() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  }
  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function blankQuestion() {
    return { id: uid(), type: 'single', prompt: '', choices: Array.from({length:4}, (_, i) => ({id:String(i+1), text:''})), correct: [], answer: '', explanation: '', tags: [] };
  }
  function blankSet() {
    return { id: uid(), title: '', category: [], unit: '', description: '', questions: [] };
  }
  function validateQuestion(q, at = '問題') {
    const errors = [];
    if (!q || typeof q !== 'object') return [at + 'の形式が不正です。'];
    if (!validId(q.id)) errors.push(at + 'のIDが不正です（英数字・ハイフン・アンダースコア、100文字以内）。');
    if (!TYPES.includes(q.type)) errors.push(at + 'の出題形式が未対応です。');
    if (typeof q.prompt !== 'string' || !q.prompt.trim()) errors.push(at + 'の問題文を入力してください。');
    if (typeof q.explanation !== 'string') errors.push(at + 'の解説は文字列にしてください。');
    if (!Array.isArray(q.tags) || q.tags.some(t => typeof t !== 'string' || !t.trim())) errors.push(at + 'のタグが不正です。');
    if (q.type === 'text') {
      if (typeof q.answer !== 'string' || !q.answer.trim()) errors.push(at + 'の正答を入力してください。');
      if (!Array.isArray(q.choices) || q.choices.length || !Array.isArray(q.correct) || q.correct.length) errors.push(at + 'の記述問題には選択肢を設定できません。');
    } else {
      if (!Array.isArray(q.choices) || q.choices.length < 2 || q.choices.length > 6) errors.push(at + 'の選択肢は2〜6個にしてください。');
      else {
        if (q.choices.some(c => !c || !validId(c.id) || typeof c.text !== 'string' || !c.text.trim())) errors.push(at + 'の選択肢に空欄または不正なIDがあります。');
        const ids = q.choices.map(c => c?.id);
        if (new Set(ids).size !== ids.length) errors.push(at + 'の選択肢IDが重複しています。');
        if (!Array.isArray(q.correct) || !q.correct.length || q.correct.some(id => !ids.includes(id)) || new Set(q.correct).size !== q.correct.length) errors.push(at + 'の正答を選んでください（重複不可）。');
        else if (q.type === 'single' && q.correct.length !== 1) errors.push(at + 'は正答を1つにしてください。');
      }
    }
    return errors;
  }
  function validateLibrary(data) {
    if (!data || data.schemaVersion !== VERSION || !Array.isArray(data.sets)) return ['対応するJSON形式は schemaVersion: 1 と sets 配列です。'];
    const errors = [], setIds = new Set(), questionIds = new Set();
    if (data.sets.length > 1000) return ['問題集は一度に1,000個まで取り込めます。'];
    for (const [i, set] of data.sets.entries()) {
      const at = '問題集' + (i + 1);
      if (!set || typeof set !== 'object') { errors.push(at + 'の形式が不正です。'); continue; }
      if (!validId(set.id) || setIds.has(set.id)) errors.push(at + 'のIDが不正または重複しています。');
      setIds.add(set.id);
      if (typeof set.title !== 'string' || !set.title.trim()) errors.push(at + 'の名前を入力してください。');
      if (!Array.isArray(set.category) || set.category.some(c => typeof c !== 'string' || !c.trim())) errors.push(at + 'のカテゴリは文字列の配列にしてください。');
      if (typeof set.unit !== 'string' || typeof set.description !== 'string') errors.push(at + 'の単元・説明は文字列にしてください。');
      if (!Array.isArray(set.questions) || set.questions.length > 10000) { errors.push(at + 'の問題配列が不正です（上限10,000問）。'); continue; }
      for (const [j, q] of set.questions.entries()) {
        errors.push(...validateQuestion(q, at + '・問' + (j+1)));
        if (q && questionIds.has(q.id)) errors.push(at + '・問' + (j+1) + 'の問題IDが重複しています。');
        if (q) questionIds.add(q.id);
      }
    }
    return errors;
  }
  function assertLibrary(data) {
    const errors = validateLibrary(data);
    if (errors.length) throw new Error(errors.slice(0, 12).join('\n') + (errors.length > 12 ? '\nほか' + (errors.length-12) + '件' : ''));
    return clone(data);
  }
  function duplicateSet(set) {
    const copy = clone(set); copy.id = uid();
    copy.questions.forEach(q => q.id = uid());
    return copy;
  }
  function pool(sets, selected, tag = '', records = null) {
    return sets.filter(s => selected.includes(s.id)).flatMap(s => s.questions.filter(q => (!tag || q.tags.includes(tag)) && (!records || records[q.id]?.correct === false)).map(q => ({...clone(q), setTitle:s.title, setId:s.id, category:clone(s.category), unit:s.unit})));
  }
  function isCorrect(q, selected) {
    if (q.type === 'text') return typeof selected === 'string' && selected.trim() === q.answer.trim();
    return Array.isArray(selected) && selected.length === q.correct.length && new Set(selected).size === selected.length && q.correct.every(id => selected.includes(id));
  }
  function createSession(questions, options = {}, random = Math.random) {
    if (!questions.length) throw new Error('出題できる問題がありません。');
    const count = options.count === undefined ? questions.length : Number(options.count);
    if (!Number.isInteger(count) || count < 1 || count > questions.length) throw new Error('問題数は1〜' + questions.length + 'で指定してください。');
    const ordered = (options.shuffleQuestions ? shuffle(questions, random) : [...questions]).slice(0, count);
    return { version:VERSION, id:uid(), questions:clone(ordered), current:0, drafts:{}, answers:{}, scroll:{}, completed:false, createdAt:Date.now(), choiceOrders:Object.fromEntries(ordered.map(q => [q.id, options.shuffleChoices ? shuffle(q.choices.map(c => c.id), random) : q.choices.map(c => c.id)])) };
  }
  function grade(session, selected) {
    const q = session.questions[session.current];
    if (session.answers[q.id]) return session.answers[q.id];
    if (q.type === 'text' ? typeof selected !== 'string' || !selected.trim() : !Array.isArray(selected) || !selected.length || selected.some(id => !q.choices.some(c => c.id === id)) || (q.type === 'single' && selected.length !== 1)) throw new Error('回答を選択・入力してください。');
    const answer = { selected:clone(selected), correct:isCorrect(q, selected), at:Date.now() };
    session.answers[q.id] = answer; delete session.drafts[q.id];
    return answer;
  }
  function summary(session) {
    const a = Object.values(session.answers), correct = a.filter(x => x.correct).length;
    return { total:session.questions.length, answered:a.length, correct, wrong:a.length-correct, pending:session.questions.length-a.length };
  }
  return { VERSION, TYPES, clone, escapeHTML, renderRich, uid, shuffle, blankQuestion, blankSet, validateQuestion, validateLibrary, assertLibrary, duplicateSet, pool, isCorrect, createSession, grade, summary };
});
