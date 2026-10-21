/* Legacy CSV and versioned JSON adapters. No fetching or code execution. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.QuizFormats = factory(root.QuizCore);
})(globalThis, function(C) {
  'use strict';
  const HEADER = ['type','question','choice1','choice2','choice3','choice4','choice5','choice6','answer','explanation'];
  function parseRows(input) {
    const text = input.replace(/^\uFEFF/, '');
    const rows = []; let row = [], cell = '', state = 'start';
    function endCell() { row.push(cell); cell = ''; state = 'start'; }
    function endRow() { endCell(); rows.push(row); row = []; }
    for (let i=0; i<text.length; i++) {
      const c=text[i];
      if (state==='quoted') {
        if (c==='"') { if (text[i+1]==='"') {cell+='"'; i++;} else state='closed'; }
        else cell+=c;
      } else if (c===',') endCell();
      else if (c==='\r'||c==='\n') {if(c==='\r'&&text[i+1]==='\n')i++; endRow();}
      else if (c==='"' && state==='start') state='quoted';
      else if (state==='closed' || c==='"') throw new Error('CSV '+(rows.length+1)+'行目：引用符の位置を確認してください。');
      else {cell+=c;state='plain';}
    }
    if (state==='quoted') throw new Error('CSVの引用符が閉じられていません。');
    if (cell || row.length || state!=='start') endRow();
    return rows;
  }
  function importCSV(text, title='読み込んだ問題集') {
    const rows=parseRows(text), warnings=[];
    if (!rows.length || !['type','形式','問題形式'].includes(rows[0][0]?.trim().toLowerCase())) throw new Error('CSVの先頭には type,question,choice1,…,answer,explanation の見出しが必要です。');
    if (rows[0].length < 9) throw new Error('CSVの見出しは9〜10列以上必要です。');
    const set=C.blankSet();set.title=title;
    for (const [i, row] of rows.slice(1).entries()) {
      if (!row.some(s=>s.trim()))continue;
      if (row.length<9)throw new Error('CSV '+(i+2)+'行目：正答を含む9列以上が必要です。');
      if (row.length>10)warnings.push((i+2)+'行目：11列目以降を解説に結合しました。');
      let type=row[0].trim(), answer=row[8].trim();
      if(type==='single'&&answer.includes('|')){type='multi';warnings.push((i+2)+'行目：正答が複数のため複数選択として読み込みます。');}
      if (type!=='text'&&!/^[1-6](?:\s*\|\s*[1-6])*$/.test(answer)) throw new Error('CSV '+(i+2)+'行目：正答番号は1〜6、複数は1|2の形で指定してください。');
      const q={id:C.uid(),type,prompt:row[1],choices:type==='text'?[]:row.slice(2,8).map((text,i)=>({id:String(i+1),text})).filter(c=>c.text.trim()),correct:type==='text'?[]:answer.split('|').map(s=>s.trim()),answer:type==='text'?answer:'',explanation:row.slice(9).join(','),tags:[]};
      if (/<(?:img|svg|iframe|video|audio)\b/i.test(JSON.stringify(q))) warnings.push((i+2)+'行目：画像・埋め込みは表示されません。文字データは保持します。');
      const errors=C.validateQuestion(q,'CSV '+(i+2)+'行目');if(errors.length)throw new Error(errors.join('\n'));
      set.questions.push(q);
    }
    if(!set.questions.length)throw new Error('CSVに問題がありません。');
    return {sets:[set],warnings};
  }
  function exportCSV(set) {
    const rows=[HEADER];
    for(const q of set.questions){
      // Keep source numeric slots, including blank slots, so explanations retain their references.
      const numbered=q.choices.every(c=>/^[1-6]$/.test(c.id));
      const ids=numbered?q.choices.map(c=>c.id):q.choices.map((_,i)=>String(i+1));
      const cells=Array(6).fill('');q.choices.forEach((c,i)=>cells[Number(ids[i])-1]=c.text);
      rows.push([q.type,q.prompt,...cells,q.type==='text'?q.answer:q.correct.map(id=>ids[q.choices.findIndex(c=>c.id===id)]).join('|'),q.explanation]);
    }
    return '\uFEFF'+rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
  }
  function importJSON(text) {
    let data;try{data=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('JSONの形式が不正です。括弧・カンマ・引用符を確認してください。');}
    return {sets:C.assertLibrary(data).sets,warnings:[]};
  }
  function exportJSON(sets) {return JSON.stringify(C.assertLibrary({schemaVersion:1,sets}),null,2)+'\n';}
  function manifestEntries(value, trail=[]) {
    if(typeof value==='string')value={path:value};
    if(value && !Array.isArray(value) && typeof value.path==='string') {
      const path=value.path.replace(/^\.\//,'');
      if(!path || path.startsWith('/') || /(?:^|\/)\.\.(?:\/|$)|[\\:#?]/.test(path))throw new Error('相対CSVパスを指定してください：'+path);
      return [{path,title:value.title||trail.at(-1)||path,category:trail.slice(0,-1)}];
    }
    if(value && Array.isArray(value.children))return manifestEntries(value.children,trail);
    if(Array.isArray(value))return value.flatMap((v,i)=>manifestEntries(v,[...trail,v?.title||'単元'+(i+1)]));
    if(value && typeof value==='object')return Object.entries(value).flatMap(([k,v])=>manifestEntries(v,[...trail,k]));
    throw new Error('メニュー形式が不正です：'+trail.join(' / '));
  }
  return {HEADER,parseRows,importCSV,exportCSV,importJSON,exportJSON,manifestEntries};
});
