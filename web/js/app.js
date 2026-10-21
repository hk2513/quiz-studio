/* Quiz Studio UI. Framework-free, all user data stays in this browser. */
(() => {
  'use strict';
  const C=QuizCore, F=QuizFormats, main=document.querySelector('#main'), dialog=document.querySelector('#dialog');
  let state, route='library', selected=new Set(), search='', tag='', wrongOnly=false, readQuestions=[], editor=null, dirty=false, importing=null, startQuestions=[], saving=0, saveTimer, scrollTimer, actionBusy=false;
  const openGroups=new Set();
  const $=s=>document.querySelector(s);
  const esc=C.escapeHTML;
  // Only exact, attribute-free formatting tags are interpreted. URLs and images remain inert text.
  const rich=C.renderRich;
  const plain=s=>String(s).replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'');
  const typeName=q=>q.type==='single'?'1つ選択':q.type==='multi'?q.correct.length+'つ選択':'記述';
  const findSet=id=>state.sets.find(s=>s.id===id);
  const selectedSets=()=>state.sets.filter(s=>selected.has(s.id));
  function notify(message){$('#notice').textContent=message;$('#notice').hidden=!message;}
  function setSaveError(message){$('#save-error').textContent=message;$('#save-error').hidden=!message;}
  async function persist(){
    clearTimeout(saveTimer);saving++;$('#save-state').textContent='保存中';
    try{await QuizStorage.save(state);setSaveError('');$('#save-state').textContent='保存済み';return true;}
    catch(e){setSaveError(e.message);$('#save-state').textContent='未保存';return false;}
    finally{saving--;}
  }
  function captureScroll(){if(route==='quiz'&&state.session){const s=state.session;s.scroll[s.questions[s.current].id]=window.scrollY;}}
  function navigate(next){if(dirty&&!confirm('保存していない編集を破棄しますか？'))return;dirty=false;editor=null;captureScroll();if(route==='quiz')persist();location.hash=next; if(route===next)render();}
  function page(html, dock=false){main.innerHTML=html;document.body.classList.toggle('has-dock',dock);document.body.classList.toggle('large-text',!!state.settings.largeText);window.scrollTo(0,0);main.focus({preventScroll:true});requestAnimationFrame(measureDock);}
  function measureDock(){const el=$('.dock');if(el)document.documentElement.style.setProperty('--dock-height',Math.ceil(el.getBoundingClientRect().height)+'px');}
  const observer=new ResizeObserver(measureDock);
  observer.observe(document.documentElement);
  function dialogHTML(title,body){dialog.innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="quiet" data-action="close-dialog" aria-label="閉じる">✕</button></div>${body}`;if(!dialog.open)dialog.showModal();}
  function errorInDialog(e){let el=dialog.querySelector('.errors');if(!el){el=document.createElement('p');el.className='errors';el.setAttribute('role','alert');dialog.append(el);}el.textContent=e.message;}
  function buttonsCancel(label,action){return `<div class="dialog-actions"><button data-action="close-dialog">キャンセル</button><button class="primary" data-action="${action}">${label}</button></div>`;}
  function resumeHTML(){const s=state.session;if(!s||s.completed)return '';const n=C.summary(s);return `<section class="resume"><div><h2>前回の続き</h2><p>${n.total}問中 ${n.answered}問 回答済み</p></div><button class="primary" data-action="resume">再開する</button></section>`;}
  function filteredSets(){const needle=search.toLocaleLowerCase();return state.sets.filter(s=>[s.title,s.unit,...s.category,...s.questions.flatMap(q=>q.tags)].join(' ').toLocaleLowerCase().includes(needle));}
  function treeHTML(sets,depth=0,path=[]){
    const branches=new Map(),leaves=[];
    for(const s of sets){if(s.category.length<=depth)leaves.push(s);else{const key=s.category[depth];if(!branches.has(key))branches.set(key,[]);branches.get(key).push(s);}}
    const rows=leaves.map(s=>`<div class="set-row ${selected.has(s.id)?'is-selected':''}"><label class="set-check"><input type="checkbox" data-select="${esc(s.id)}" ${selected.has(s.id)?'checked':''} aria-label="${esc(s.title)}を選択"></label><div class="set-body"><button class="set-title" data-action="open-set" data-id="${esc(s.id)}">${esc(s.title)}</button><div class="set-meta"><span>${s.questions.length}問</span>${s.unit?`<span>· ${esc(s.unit)}</span>`:''}</div></div><button class="quiet set-preview" data-action="preview-set" data-id="${esc(s.id)}">読む</button></div>`).join('');
    return rows+[...branches].map(([label,items])=>{
      const key=JSON.stringify([...path,label]);return `<details class="category" data-group="${esc(key)}" ${!openGroups.has(key)?'open':''}><summary><strong>${esc(label)}</strong><span class="badge">${items.length}冊</span></summary><div class="actions group-actions"><button class="quiet small" data-action="select-group" data-path="${esc(key)}">このカテゴリを選ぶ</button></div>${treeHTML(items,depth+1,[...path,label])}</details>`;
    }).join('');
  }
  function library(){
    selected=new Set([...selected].filter(id=>findSet(id)));
    const allTags=[...new Set(state.sets.flatMap(s=>s.questions.flatMap(q=>q.tags)))].sort();
    const total=state.sets.reduce((n,s)=>n+s.questions.length,0);
    const html=`<div class="page-top"><div class="page-title"><h1>問題集</h1><small>${state.sets.length}冊 · ${total}問</small></div><div class="actions"><button data-action="import">読み込む</button><button class="primary" data-action="new-set">＋ 問題集を作る</button></div></div>${resumeHTML()}<div class="workspace-tools"><input class="search" type="search" id="search" placeholder="問題集・カテゴリを検索" value="${esc(search)}" aria-label="問題集・カテゴリを検索"><select id="tag-filter" aria-label="演習するタグ"><option value="">すべてのタグ</option>${allTags.map(t=>`<option ${tag===t?'selected':''}>${esc(t)}</option>`).join('')}</select><label class="check-inline"><input type="checkbox" id="wrong-filter" ${wrongOnly?'checked':''}>誤答のみ</label></div><div class="library-layout"><section aria-label="問題集一覧"><div class="actions"><button class="quiet small" data-action="select-visible">表示中をすべて選ぶ</button><button class="quiet small" data-action="clear-selection">選択解除</button></div><div id="set-tree">${treeHTML(filteredSets())||'<div class="empty"><h2>問題集がありません</h2><p>新しく作るか、CSV・JSONを読み込めます。</p><button data-action="new-set">問題集を作る</button></div>'}</div></section><aside class="side-card"><h2>登録済みの問題</h2><div class="large-number">${total}<span class="stat-caption"> 問</span></div><p>${state.sets.length}冊の問題集</p><hr><h3>データの持ち運び</h3><p>このブラウザに保存しています。<br>大切な問題集はJSONで保管できます。</p><button data-action="export-all">すべて書き出す</button></aside></div><div class="dock"><div class="dock-count" id="selection-count"></div><div class="actions"><button data-action="read-selected" id="read-selected">読む</button><button class="primary" data-action="practice" id="practice">演習する</button></div></div>`;
    page(html,true);updateSelection();attachDetails();
  }
  function attachDetails(){main.querySelectorAll('details[data-group]').forEach(el=>el.addEventListener('toggle',()=>{if(!el.isConnected)return;if(el.open)openGroups.delete(el.dataset.group);else openGroups.add(el.dataset.group);}));}
  function currentPool(){return C.pool(state.sets,[...selected],tag,wrongOnly?state.records:null);}
  function updateSelection(){const n=currentPool().length;$('#selection-count').innerHTML=`<strong>${selected.size}冊 選択</strong><small>${n}問${tag?' · '+esc(tag):''}${wrongOnly?' · 誤答のみ':''}</small>`;$('#practice').disabled=!n;$('#read-selected').disabled=!n;main.querySelectorAll('[data-select]').forEach(el=>{el.checked=selected.has(el.dataset.select);el.closest('.set-row').classList.toggle('is-selected',el.checked);});}
  function openSet(set){
    page(`<button class="quiet back" data-action="library">‹ 問題集</button><div class="page-top"><div class="page-title"><span class="counter">${esc([...set.category,set.unit].filter(Boolean).join(' / '))}</span><h1>${esc(set.title)}</h1><p class="set-description">${esc(set.description)}</p></div><button data-action="metadata" data-id="${esc(set.id)}">名前・分類を編集</button></div><div class="actions"><button class="primary" data-action="new-question" data-id="${esc(set.id)}">＋ 問題を追加</button><button data-action="preview-set" data-id="${esc(set.id)}">プレビュー</button><button data-action="export-set" data-id="${esc(set.id)}">書き出す</button><button class="quiet" data-action="duplicate-set" data-id="${esc(set.id)}">複製</button><button class="quiet danger" data-action="delete-set" data-id="${esc(set.id)}">削除</button></div><div class="question-list">${set.questions.map((q,i)=>`<article class="question-row"><div class="q-snippet"><span class="counter">問${i+1} · ${typeName(q)}</span><p>${esc(plain(q.prompt))}</p></div><div class="actions"><button class="quiet small" data-action="edit-question" data-id="${esc(q.id)}" data-set="${esc(set.id)}">編集</button><button class="quiet small" data-action="duplicate-question" data-id="${esc(q.id)}" data-set="${esc(set.id)}">複製</button><button class="quiet small danger" data-action="delete-question" data-id="${esc(q.id)}" data-set="${esc(set.id)}">削除</button></div></article>`).join('')||'<div class="empty"><h2>最初の1問を作りましょう</h2><p>問題文、選択肢、正答を入力できます。</p></div>'}</div>`);
  }
  function metadata(id){
    const set=id?findSet(id):C.blankSet();
    dialogHTML(id?'問題集の設定':'問題集を作る',`<form id="set-form" data-id="${esc(set.id)}" data-new="${!id}"><label class="field"><span>名前</span><input name="title" required maxlength="160" value="${esc(set.title)}" placeholder="例：英語の基本"></label><div class="field-row"><label class="field"><span>カテゴリ</span><input name="category" value="${esc(set.category.join(' / '))}" placeholder="例：語学 / 英語"><small>「 / 」で階層を分けられます</small></label><label class="field"><span>単元</span><input name="unit" value="${esc(set.unit)}" placeholder="例：日常会話"></label></div><label class="field"><span>説明（任意）</span><textarea name="description">${esc(set.description)}</textarea></label><p class="errors" role="alert"></p><div class="dialog-actions"><button type="button" data-action="close-dialog">キャンセル</button><button class="primary" type="submit">${id?'保存':'作成'}</button></div></form>`);
  }
  function editQuestion(setId,qId){
    const set=findSet(setId);if(!set)return navigate('library');
    if(!editor || editor.setId!==setId || editor.qId!==qId){const q=qId==='new'?C.blankQuestion():set.questions.find(q=>q.id===qId);if(!q)return navigate('set/'+setId);editor={setId,qId,q:C.clone(q)};dirty=false;}
    const q=editor.q;
    page(`<section class="editor"><button class="quiet back" data-action="open-set" data-id="${esc(setId)}">‹ ${esc(set.title)}</button><div class="page-top"><h1>${qId==='new'?'問題を追加':'問題を編集'}</h1><button data-action="preview-draft">プレビュー</button></div><form id="question-form"><div class="panel"><div class="field-row"><label class="field"><span>出題形式</span><select id="q-type" name="type">${[['single','単一選択'],['multi','複数選択'],['text','記述（完全一致）']].map(([v,t])=>`<option value="${v}" ${q.type===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="field"><span>タグ（任意）</span><input name="tags" value="${esc(q.tags.join(', '))}" placeholder="例：基礎, 復習"><small>カンマ区切り</small></label></div><label class="field"><span>問題文</span><textarea name="prompt" required rows="4" placeholder="問題文を入力">${esc(q.prompt)}</textarea></label></div><div class="panel"><h2>${q.type==='text'?'正答':'選択肢と正答'}</h2>${q.type==='text'?`<label class="field"><span>一致させる文字列</span><input name="answer" required value="${esc(q.answer)}"><small>前後の空白を除いて完全一致で採点します</small></label>`:`<p class="editor-help">正答の左側にチェックを付けてください。</p><div id="choice-fields">${q.choices.map(c=>`<div class="choice-editor"><label class="correct-pick"><input type="${q.type==='single'?'radio':'checkbox'}" name="correct" value="${esc(c.id)}" ${q.correct.includes(c.id)?'checked':''} aria-label="選択肢${esc(c.id)}を正答にする"><span>${esc(c.id)}</span></label><textarea data-choice="${esc(c.id)}" required aria-label="選択肢${esc(c.id)}">${esc(c.text)}</textarea><button type="button" class="quiet" data-action="remove-choice" data-id="${esc(c.id)}" aria-label="選択肢${esc(c.id)}を削除" ${q.choices.length<=2?'disabled':''}>✕</button></div>`).join('')}</div><button type="button" class="quiet small" data-action="add-choice" ${q.choices.length>=6?'disabled':''}>＋ 選択肢を追加</button>`}</div><div class="panel"><label class="field"><span>解説（任意）</span><textarea name="explanation" rows="6" placeholder="正答の理由と、ほかの選択肢が誤りである理由">${esc(q.explanation)}</textarea></label></div><p id="question-errors" class="errors" role="alert"></p><div class="dock"><button type="button" data-action="open-set" data-id="${esc(setId)}">キャンセル</button><button type="submit" class="primary">保存する</button></div></form></section>`,true);
  }
  function collectEditor(){
    const form=$('#question-form');if(!form||!editor)return;
    const q=editor.q;q.prompt=form.elements.prompt.value;q.explanation=form.elements.explanation.value;q.tags=[...new Set(form.elements.tags.value.split(/[,、]/).map(s=>s.trim()).filter(Boolean))];
    if(q.type==='text')q.answer=form.elements.answer.value;
    else{form.querySelectorAll('[data-choice]').forEach(el=>q.choices.find(c=>c.id===el.dataset.choice).text=el.value);q.correct=[...form.querySelectorAll('[name=correct]:checked')].map(el=>el.value);}
  }
  function answerHTML(q){return q.type==='text'?`<div class="rich">${rich(q.answer)}</div>`:`<ul class="answer-list">${q.choices.filter(c=>q.correct.includes(c.id)).map(c=>`<li><span class="rich">${esc(c.id)}. ${rich(c.text)}</span></li>`).join('')}</ul>`;}
  function explanationHTML(q){return `<h3>解説</h3><div class="rich">${q.explanation?rich(q.explanation):'解説はありません。'}</div>`;}
  function readCard(q,i){return `<article class="question-card read-card"><div class="question-content"><div class="question-label"><strong>問${i+1}</strong><span class="badge">${typeName(q)}</span></div><div class="prompt rich">${rich(q.prompt)}</div><ol class="read-choices">${q.choices.map(c=>`<li value="${esc(c.id)}" class="rich">${rich(c.text)}</li>`).join('')}</ol></div><details class="read-answer"><summary>正答・解説</summary><div>${answerHTML(q)}${explanationHTML(q)}</div></details></article>`;}
  function reading(){page(`<div class="quiz"><div class="page-top"><div><button class="quiet back" data-action="library">‹ 問題集</button><h1>読む <span class="badge">${readQuestions.length}問</span></h1></div><div class="actions"><button data-action="expand-answers">解説をすべて開く</button></div></div>${readQuestions.map(readCard).join('')||'<p>問題集の「読む」から開いてください。</p>'}</div>`);}
  function setup(questions){
    if(!questions.length)return notify('出題できる問題がありません。');startQuestions=questions;
    dialogHTML('演習を始める',`<p class="dialog-note">${questions.length}問から出題</p><label class="field"><span>問題数</span><input type="number" id="count" min="1" max="${questions.length}" step="1" value="${questions.length}"></label><label class="check-row">問題順をシャッフル<input type="checkbox" id="shuffle-questions" ${state.settings.shuffleQuestions?'checked':''}></label><label class="check-row">選択肢順をシャッフル<input type="checkbox" id="shuffle-choices" ${state.settings.shuffleChoices?'checked':''}></label>${state.session&&!state.session.completed&&state.settings.confirmOverwrite?'<p class="dialog-note">中断データが上書きされます。</p><label class="check-inline"><input type="checkbox" id="skip-confirm">次回からこの確認を表示しない</label>':''}<p class="errors" role="alert"></p>${buttonsCancel('始める','start')}`);
  }
  function quiz(){
    const s=state.session;if(!s||!s.questions.length)return navigate('library');
    const q=s.questions[s.current],a=s.answers[q.id],draft=a?.selected??s.drafts[q.id]??(q.type==='text'?'':[]),n=C.summary(s);
    const options=s.choiceOrders[q.id].map(id=>q.choices.find(c=>c.id===id));
    const fields=q.type==='text'?`<label class="field"><span>回答</span><input id="text-answer" value="${esc(draft)}" ${a?'readonly':''} autocomplete="off"></label>`:`<div class="choices" role="group" aria-label="選択肢">${options.map(c=>{const picked=draft.includes(c.id),good=a&&q.correct.includes(c.id),bad=a&&picked&&!good;return `<${a?'div':'label'} class="choice ${good?'good':bad?'bad':a?'neutral':''}">${a?'':`<input type="${q.type==='single'?'radio':'checkbox'}" name="answer-choice" value="${esc(c.id)}" ${picked?'checked':''}>`}<span class="choice-num">${esc(c.id)}</span><span class="choice-body"><span class="rich">${rich(c.text)}</span>${a&&(good||picked)?`<span class="choice-status">${good?'✓ 正答':''}${good&&picked?' · ':''}${picked?'あなたの回答':''}</span>`:''}</span></${a?'div':'label'}>`;}).join('')}</div>`;
    const oldY=s.scroll[q.id]||0;
    page(`<div class="quiz"><div class="quiz-tools"><span>${esc(q.setTitle||'演習')}</span><button class="quiet" data-action="pause">中断</button></div><div class="progress-info"><button class="quiet small" data-action="navigator">問題一覧　${s.current+1} / ${n.total}</button><span>${n.answered}問 回答済み</span></div><progress value="${n.answered}" max="${n.total}" aria-label="回答済みの問題数"></progress><article class="question-card"><div class="question-content"><div class="question-label"><strong id="question-heading" tabindex="-1">問${s.current+1}</strong><span class="badge">${typeName(q)}</span></div><div class="prompt rich">${rich(q.prompt)}</div>${fields}</div>${a?`<section class="feedback" tabindex="-1" aria-label="回答結果"><h2 class="${a.correct?'good-text':'bad-text'}">${a.correct?'✓ 正解':'不正解'}</h2><h3>正答</h3>${answerHTML(q)}${explanationHTML(q)}</section>`:''}</article></div><nav class="dock quiz-dock" aria-label="問題の操作"><button class="quiet" data-action="previous" ${s.current===0?'disabled':''}>‹ 前へ</button>${a?'<span class="answered">✓ 回答済み</span>':'<button class="primary" data-action="answer" id="submit-answer">回答する</button>'}<button class="${a?'primary':''}" data-action="next">${s.current===n.total-1?'結果を見る':'次へ ›'}</button></nav>`,true);
    updateAnswerButton();requestAnimationFrame(()=>window.scrollTo(0,oldY));
  }
  function updateAnswerButton(){if(!$('#submit-answer'))return;const s=state.session,q=s.questions[s.current],d=s.drafts[q.id];$('#submit-answer').disabled=q.type==='text'?!String(d||'').trim():!d?.length;}
  function move(index){captureScroll();state.session.current=index;persist();quiz();$('#question-heading')?.focus({preventScroll:true});}
  function navigator(){const s=state.session;dialogHTML('問題一覧',`<div class="navigator">${s.questions.map((q,i)=>{const a=s.answers[q.id];return `<button data-action="jump" data-index="${i}" class="${a?(a.correct?'good':'bad'):''}" ${s.current===i?'aria-current="step"':''}>${i+1}<small>${a?(a.correct?'✓ 正解':'× 誤答'):s.drafts[q.id]?.length?'未確定':'未回答'}</small></button>`;}).join('')}</div>`);}
  function results(){
    const s=state.session;if(!s)return navigate('library');const n=C.summary(s);
    page(`<section class="result"><button class="quiet back" data-action="library">‹ 問題集</button><div class="panel"><h1>演習結果</h1><div class="score">${n.correct}<small> / ${n.total}問 正解</small></div><div class="stats"><span class="badge">不正解 ${n.wrong}</span><span class="badge">未回答 ${n.pending}</span><span class="badge">回答済み ${n.answered}</span></div><div class="actions">${n.pending?'<button class="primary" data-action="pending">未回答に戻る</button>':''}${n.wrong?'<button data-action="retry-wrong">誤答を解き直す</button>':''}<button data-action="retry">同じ問題を解く</button><button data-action="read-session">解説を読む</button></div></div><div class="result-list"><h2>回答一覧</h2>${s.questions.map((q,i)=>`<button class="result-item" data-action="jump" data-index="${i}"><span class="${s.answers[q.id]?.correct?'good-text':'bad-text'}">${s.answers[q.id]?(s.answers[q.id].correct?'✓':'×'):'—'}</span><span>${i+1}</span><span>${esc(plain(q.prompt))}</span></button>`).join('')}</div></section>`);
  }
  function render(){
    const next=location.hash.slice(1)||'library';route=next;notify('');
    const [view,setId,qId]=next.split('/');
    if(view==='library')library();else if(view==='set'&&findSet(setId))openSet(findSet(setId));else if(view==='edit')editQuestion(setId,qId);else if(view==='read')reading();else if(view==='quiz')quiz();else if(view==='results')results();else navigate('library');
  }
  function download(name,content,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  function exportDialog(id){dialogHTML('書き出す',`<p class="dialog-note">JSONは分類・タグ・IDを含めて保存します。CSVは既存の10列形式で、分類・タグは含みません。表計算ソフトで開く場合、外部から受け取った内容の数式実行には注意してください。</p><div class="actions"><button class="primary" data-action="download-json" data-id="${esc(id||'')}">JSON</button>${id?`<button data-action="download-csv" data-id="${esc(id)}">CSV</button>`:''}</div>`);}
  function settings(){dialogHTML('設定',`<label class="check-row">文字を大きくする<input type="checkbox" id="large-text" ${state.settings.largeText?'checked':''}></label><label class="check-row">中断データの上書きを確認<input type="checkbox" id="overwrite-setting" ${state.settings.confirmOverwrite?'checked':''}></label><p class="dialog-note">問題集・回答・学習履歴は、この端末のブラウザ内に保存されます。サイトデータを削除すると消えます。別端末への自動同期はありません。</p><button data-action="export-all">問題集をJSONで書き出す</button><p class="dialog-note">Quiz Studio 0.1.0 · MIT<br>アカウント・通信先サーバー・解析ツールはありません。</p>`);}
  function importMenu(){dialogHTML('問題集を読み込む',`<p class="dialog-note">CSV / Quiz StudioのJSONに対応。既存サイトのメニューは、manifest.jsonとCSVが入ったフォルダーから取り込めます。</p><div class="actions"><button class="primary" data-action="choose-files">CSV・JSONを選ぶ</button><button data-action="choose-folder">フォルダーを選ぶ</button></div><p class="dialog-note">ファイルはサーバーに送信されません。読み込み内容を確認してから追加できます。</p>`);}
  async function prepareImport(files,folder=false){
    try{
      let sets=[],warnings=[];
      if(files.length>1000 || files.reduce((n,f)=>n+f.size,0)>20*1024*1024)throw new Error('一度に読み込めるのは1,000ファイル・合計20MBまでです。');
      if(folder){
        const manifests=files.filter(f=>/(?:^|\/)manifest\.json$/.test(f.webkitRelativePath));if(manifests.length!==1)throw new Error('manifest.jsonが1つ入ったフォルダーを選んでください。');
        const mf=manifests[0],root=mf.webkitRelativePath.slice(0,-'manifest.json'.length),map=new Map(files.map(f=>[f.webkitRelativePath,f]));
        const entries=F.manifestEntries(JSON.parse((await mf.text()).replace(/^\uFEFF/,'')));
        for(const entry of entries){const file=map.get(root+entry.path);if(!file)throw new Error('CSVが見つかりません：'+entry.path);const result=F.importCSV(await file.text(),entry.title);result.sets[0].category=entry.category;result.sets[0].unit=entry.title;sets.push(...result.sets);warnings.push(...result.warnings);}
      } else for(const file of files){const text=await file.text();const result=/\.csv$/i.test(file.name)?F.importCSV(text,file.name.replace(/\.csv$/i,'')):/\.json$/i.test(file.name)?F.importJSON(text):null;if(!result)throw new Error('CSVまたはJSONを選んでください。');sets.push(...result.sets);warnings.push(...result.warnings);}
      if(!sets.length)throw new Error('追加する問題集がありません。');C.assertLibrary({schemaVersion:1,sets});
      importing={sets,warnings};const matches=sets.filter(s=>findSet(s.id)).length;
      dialogHTML('読み込み内容を確認',`<p class="dialog-note">${sets.length}冊 · ${sets.reduce((n,s)=>n+s.questions.length,0)}問</p>${sets.map(s=>`<div class="import-item"><strong>${esc(s.title)}</strong> · ${s.questions.length}問<small class="muted"> ${esc(s.category.join(' / '))}</small></div>`).join('')}${matches?`<p class="dialog-note">同じIDの問題集が${matches}冊あります。</p><label class="field"><span>読み込み方法</span><select id="import-mode"><option value="copy">別の問題集として追加</option><option value="update">同じIDの問題集を更新</option></select></label>`:''}${warnings.length?`<p class="import-warning">${warnings.slice(0,12).map(esc).join('\n')}${warnings.length>12?'\nほか'+(warnings.length-12)+'件':''}</p>`:''}<p class="errors" role="alert"></p>${buttonsCancel('取り込む','confirm-import')}`);
    }catch(e){dialogHTML('読み込めませんでした',`<p class="errors" role="alert">${esc(e.message)}</p><button data-action="import">選び直す</button>`);}
  }
  document.addEventListener('submit',async e=>{
    if(!['set-form','question-form'].includes(e.target.id))return;
    e.preventDefault();if(actionBusy)return;actionBusy=true;
    try{
    if(e.target.id==='set-form'){
      e.preventDefault();const form=e.target,data=new FormData(form),old=findSet(form.dataset.id),set=old?C.clone(old):C.blankSet();set.id=form.dataset.id;set.title=data.get('title').trim();set.category=data.get('category').split('/').map(s=>s.trim()).filter(Boolean);set.unit=data.get('unit').trim();set.description=data.get('description');
      const errors=C.validateLibrary({schemaVersion:1,sets:[set]});if(errors.length){form.querySelector('.errors').textContent=errors.join('\n');return;}
      state.sets=old?state.sets.map(s=>s.id===set.id?set:s):[set,...state.sets];await persist();dialog.close();navigate('set/'+set.id);
    } else if(e.target.id==='question-form'){
      e.preventDefault();collectEditor();const errors=C.validateQuestion(editor.q);if(errors.length){$('#question-errors').textContent=errors.join('\n');$('#question-errors').scrollIntoView({block:'center'});return;}
      const set=findSet(editor.setId),q=C.clone(editor.q);if(editor.qId==='new')set.questions.push(q);else set.questions=set.questions.map(old=>old.id===q.id?q:old);
      const id=set.id;dirty=false;await persist();navigate('set/'+id);
    }
    }catch(error){if(dialog.open)errorInDialog(error);else notify(error.message);}finally{actionBusy=false;}
  });
  document.addEventListener('click',async e=>{
    if(e.target.closest('.skip')){e.preventDefault();main.focus();return;}
    const btn=e.target.closest('[data-action]');if(!btn||btn.disabled||actionBusy)return;const a=btn.dataset.action,id=btn.dataset.id;actionBusy=true;
    try{
      if(a==='close-dialog')dialog.close();
      else if(a==='library')navigate('library');
      else if(a==='settings')settings();
      else if(a==='new-set')metadata();
      else if(a==='metadata')metadata(id);
      else if(a==='open-set')navigate('set/'+id);
      else if(a==='new-question')navigate('edit/'+id+'/new');
      else if(a==='edit-question')navigate('edit/'+btn.dataset.set+'/'+id);
      else if(a==='duplicate-set'){const set=C.duplicateSet(findSet(id));set.title+='（コピー）';state.sets.unshift(set);await persist();navigate('set/'+set.id);}
      else if(a==='delete-set'){if(confirm('「'+findSet(id).title+'」を削除しますか？')){state.sets=state.sets.filter(s=>s.id!==id);await persist();navigate('library');}}
      else if(a==='duplicate-question'){const set=findSet(btn.dataset.set),q=C.clone(set.questions.find(q=>q.id===id));q.id=C.uid();set.questions.splice(set.questions.findIndex(q=>q.id===id)+1,0,q);await persist();openSet(set);}
      else if(a==='delete-question'){if(confirm('この問題を削除しますか？')){const set=findSet(btn.dataset.set);set.questions=set.questions.filter(q=>q.id!==id);await persist();openSet(set);}}
      else if(a==='add-choice'||a==='remove-choice'){collectEditor();const q=editor.q;if(a==='add-choice'){const id=['1','2','3','4','5','6'].find(id=>!q.choices.some(c=>c.id===id));q.choices.push({id,text:''});}else{q.choices=q.choices.filter(c=>c.id!==id);q.correct=q.correct.filter(c=>c!==id);}dirty=true;editQuestion(editor.setId,editor.qId);}
      else if(a==='preview-draft'){collectEditor();const errors=C.validateQuestion(editor.q);if(errors.length){$('#question-errors').textContent=errors.join('\n');return;}dialogHTML('プレビュー',readCard(editor.q,0));}
      else if(a==='select-visible'){filteredSets().forEach(s=>selected.add(s.id));updateSelection();}
      else if(a==='clear-selection'){selected.clear();updateSelection();}
      else if(a==='select-group'){const path=JSON.parse(btn.dataset.path);filteredSets().filter(s=>path.every((v,i)=>s.category[i]===v)).forEach(s=>selected.add(s.id));updateSelection();}
      else if(a==='preview-set'){readQuestions=C.pool(state.sets,[id]);navigate('read');}
      else if(a==='read-selected'){readQuestions=currentPool();navigate('read');}
      else if(a==='expand-answers'){main.querySelectorAll('.read-answer').forEach(d=>d.open=true);}
      else if(a==='practice')setup(currentPool());
      else if(a==='start'){
        const options={count:Number($('#count').value),shuffleQuestions:$('#shuffle-questions').checked,shuffleChoices:$('#shuffle-choices').checked};
        const s=C.createSession(startQuestions,options);state.session=s;state.settings.shuffleQuestions=options.shuffleQuestions;state.settings.shuffleChoices=options.shuffleChoices;if($('#skip-confirm')?.checked)state.settings.confirmOverwrite=false;await persist();dialog.close();navigate('quiz');
      }
      else if(a==='resume')navigate('quiz');
      else if(a==='pause'){captureScroll();state.session.completed=false;await persist();navigate('library');}
      else if(a==='answer'){
        const s=state.session,q=s.questions[s.current];captureScroll();const answer=C.grade(s,s.drafts[q.id]);const prev=state.records[q.id];state.records[q.id]={correct:answer.correct,attempts:(prev?.attempts||0)+1,at:Date.now()};await persist();quiz();requestAnimationFrame(()=>{const fb=$('.feedback');fb.focus({preventScroll:true});fb.scrollIntoView({block:'start',behavior:'instant'});});
      }
      else if(a==='previous')move(state.session.current-1);
      else if(a==='next'){if(state.session.current<state.session.questions.length-1)move(state.session.current+1);else{captureScroll();state.session.completed=true;await persist();navigate('results');}}
      else if(a==='navigator')navigator();
      else if(a==='jump'){if(dialog.open)dialog.close();captureScroll();state.session.current=Number(btn.dataset.index);await persist();if(route==='quiz')quiz();else navigate('quiz');}
      else if(a==='pending'){state.session.current=state.session.questions.findIndex(q=>!state.session.answers[q.id]);state.session.completed=false;await persist();navigate('quiz');}
      else if(a==='retry'||a==='retry-wrong')setup(state.session.questions.filter(q=>a==='retry'||state.session.answers[q.id]?.correct===false));
      else if(a==='read-session'){readQuestions=C.clone(state.session.questions);navigate('read');}
      else if(a==='export-all')exportDialog();
      else if(a==='export-set')exportDialog(id);
      else if(a==='download-json'){download(id?findSet(id).title+'.json':'quiz-studio-library.json',F.exportJSON(id?[findSet(id)]:state.sets),'application/json');dialog.close();}
      else if(a==='download-csv'){download(findSet(id).title+'.csv',F.exportCSV(findSet(id)),'text/csv;charset=utf-8');dialog.close();}
      else if(a==='import')importMenu();
      else if(a==='choose-files'){$('#import-files').value='';$('#import-files').click();}
      else if(a==='choose-folder'){$('#import-folder').value='';$('#import-folder').click();}
      else if(a==='confirm-import'){
        const updating=$('#import-mode')?.value==='update',incoming=updating?C.clone(importing.sets):importing.sets.map(s=>{const copy=C.duplicateSet(s);if(state.sets.some(old=>old.title===copy.title))copy.title+='（読み込み）';return copy;});
        const ids=new Set(incoming.map(s=>s.id)),next=[...incoming,...state.sets.filter(s=>!ids.has(s.id))];C.assertLibrary({schemaVersion:1,sets:next});state.sets=next;await persist();dialog.close();navigate('library');notify(incoming.length+'冊を取り込みました。');importing=null;
      }
    }catch(error){if(dialog.open)errorInDialog(error);else notify(error.message);}finally{actionBusy=false;}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='search'){search=e.target.value;$('#set-tree').innerHTML=treeHTML(filteredSets())||'<p class="empty">一致する問題集はありません。</p>';attachDetails();}
    if(e.target.closest('#question-form'))dirty=true;
    if(e.target.id==='text-answer'){const s=state.session,q=s.questions[s.current];if(!s.answers[q.id]){s.drafts[q.id]=e.target.value;persist();updateAnswerButton();}}
  });
  document.addEventListener('change',e=>{
    const el=e.target;
    if(el.dataset.select){if(el.checked)selected.add(el.dataset.select);else selected.delete(el.dataset.select);updateSelection();}
    else if(el.id==='tag-filter'){tag=el.value;updateSelection();}
    else if(el.id==='wrong-filter'){wrongOnly=el.checked;updateSelection();}
    else if(el.id==='q-type'){
      collectEditor();editor.q.type=el.value;
      if(el.value==='text'){editor.q.choices=[];editor.q.correct=[];}else{if(!editor.q.choices.length)editor.q.choices=C.blankQuestion().choices;editor.q.answer='';if(el.value==='single')editor.q.correct=editor.q.correct.slice(0,1);}dirty=true;editQuestion(editor.setId,editor.qId);
    }
    else if(el.name==='answer-choice'){const s=state.session,q=s.questions[s.current];if(!s.answers[q.id]){s.drafts[q.id]=[...main.querySelectorAll('[name=answer-choice]:checked')].map(el=>el.value);persist();updateAnswerButton();}}
    else if(el.id==='import-files'||el.id==='import-folder'){if(el.files.length)prepareImport([...el.files],el.id==='import-folder');}
    else if(el.id==='large-text'){state.settings.largeText=el.checked;document.body.classList.toggle('large-text',el.checked);persist();}
    else if(el.id==='overwrite-setting'){state.settings.confirmOverwrite=el.checked;persist();}
  });
  window.addEventListener('hashchange',()=>{if(dirty&&!confirm('保存していない編集を破棄しますか？')){history.replaceState(null,'','#'+route);return;}dirty=false;editor=null;captureScroll();render();});
  window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
  window.addEventListener('scroll',()=>{if(route!=='quiz'||dialog.open)return;captureScroll();clearTimeout(scrollTimer);scrollTimer=setTimeout(persist,200);},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){captureScroll();persist();}});
  document.addEventListener('keydown',e=>{if(e.target.id==='text-answer'&&e.key==='Enter'&&!e.isComposing&&!e.repeat&&!$('#submit-answer')?.disabled)$('#submit-answer')?.click();});
  (async()=>{
    let stored;try{stored=await QuizStorage.load();}catch(e){setSaveError('保存領域を開けません。編集後はJSONを書き出してください。 '+e.message);}
    state=stored||{sets:C.clone(QuizSamples.sets),session:null,records:{},settings:{shuffleQuestions:true,shuffleChoices:true,largeText:false,confirmOverwrite:true}};
    try{C.assertLibrary({schemaVersion:1,sets:state.sets});}catch(e){main.textContent='保存データを読み込めませんでした。サイトデータは消さず、問題報告をお願いします。 '+e.message;return;}
    if(!stored)await persist();else $('#save-state').textContent='このブラウザに保存';
    render();
  })();
})();
