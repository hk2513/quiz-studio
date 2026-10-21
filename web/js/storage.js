/* One atomic snapshot, queued writes, optimistic revision check across tabs. */
(function(root){
  'use strict';
  let db, revision=0, queue=Promise.resolve();
  function open(){return new Promise((resolve,reject)=>{
    const req=indexedDB.open('quiz-studio-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('state');
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('ほかのタブを閉じて、読み込み直してください。'));
    req.onsuccess=()=>{db=req.result;db.onversionchange=()=>db.close();resolve();};
  });}
  async function load(){await open();return new Promise((resolve,reject)=>{
    const req=db.transaction('state').objectStore('state').get('workspace');
    req.onsuccess=()=>{revision=req.result?.revision||0;resolve(req.result?.data||null);};req.onerror=()=>reject(req.error);
  });}
  function save(data){
    const snapshot=structuredClone(data);
    const task=queue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
      if(!db){reject(new Error('保存領域を開けません。JSONを書き出して保管してください。'));return;}
      const tx=db.transaction('state','readwrite'), store=tx.objectStore('state');let conflict=false;
      const req=store.get('workspace');
      req.onsuccess=()=>{
        if((req.result?.revision||0)!==revision){conflict=true;tx.abort();return;}
        store.put({revision:revision+1,data:snapshot},'workspace');
      };
      tx.oncomplete=()=>{revision++;resolve();};
      tx.onabort=()=>reject(new Error(conflict?'別のタブで更新されました。このタブの内容をJSONに書き出してから再読み込みしてください。':'保存できませんでした。容量・プライベートブラウズ設定を確認し、JSONを書き出してください。'));
      tx.onerror=()=>{};
    }));queue=task;return task;
  }
  root.QuizStorage={load,save};
})(globalThis);
