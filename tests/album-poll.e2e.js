/* Real-Chrome integration regression: unchanged photo polls must not recreate thumbnails.
   This file is injected before the app script by the test workflow; no production API calls. */
(()=>{
  const tinyGif='data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';
  const date=1791700000000;
  const remotePhotos=[{id:'TEST-photo-1',day:'1128',caption:'旅の写真',created:date}];
  const requests=[];
  let listCalls=0;
  window.__albumTest={remotePhotos,requests,getListCalls:()=>listCalls};
  const originalInterval=window.setInterval.bind(window);
  window.setInterval=(fn,ms,...rest)=>{
    if(ms===5000){window.__runAlbumPoll=fn;return 1}
    return originalInterval(fn,ms,...rest);
  };
  window.fetch=async (_url,opts={})=>{
    const action=JSON.parse(opts.body||'{}');
    requests.push(action);
    let result;
    if(action.action==='login') result={token:'TEST-browser-token'};
    else if(action.action==='get_state') result={state:null,updated_at:null};
    else if(action.action==='save_state') result={updated_at:'TEST-stamp'};
    else if(action.action==='list_photos'){
      listCalls++;
      result={photos:remotePhotos.map(p=>({...p,data:tinyGif+'#signed='+listCalls}))};
    } else if(action.action==='upload_photo'){
      remotePhotos.push({id:action.id,day:action.day,caption:action.caption||'',created:date+1});
      result={photo:{id:action.id,day:action.day,caption:action.caption||'',data:tinyGif+'#uploaded',created:date+1}};
    } else if(action.action==='delete_photo'){
      const i=remotePhotos.findIndex(p=>p.id===action.id);if(i>=0)remotePhotos.splice(i,1);
      result={};
    } else if(action.action==='update_photo_caption'){
      const photo=remotePhotos.find(p=>p.id===action.id);if(photo)photo.caption=action.caption;
      result={};
    } else result={};
    return {ok:true,status:200,json:async()=>result};
  };

  document.addEventListener('DOMContentLoaded',()=>{
    const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const check=(ok,msg)=>{if(!ok)throw Error(msg)};
    const waitFor=async(fn,msg)=>{
      for(let i=0;i<80;i++){if(fn())return;await sleep(25)}
      throw Error(msg);
    };
    const photoNodes=()=>[...document.querySelectorAll('#albumGrid button.photo')];
    (async()=>{
      try{
        check(document.body.textContent.includes('CLOUD / 2人共有'),'Cloud label missing');
        check(document.body.textContent.includes('CT-1344256'),'Itinerary missing');
        await waitFor(()=>document.querySelectorAll('#sched li').length>=6,'Initial schedule missing');
        document.getElementById('pass').value='TEST-日本語';
        document.getElementById('gateForm').requestSubmit();
        await waitFor(()=>document.getElementById('gate').classList.contains('hidden')&&!!window.__runAlbumPoll,'Login failed');

        document.querySelector('[data-view="album"]').click();
        await waitFor(()=>photoNodes().length===1,'First photo missing');
        let element=photoNodes()[0],img=element.querySelector('img'),src=img.src;
        const callsBefore=listCalls;
        for(let i=0;i<4;i++){
          await window.__runAlbumPoll();
          check(photoNodes()[0]===element,'Unchanged poll recreated photo button '+i);
          check(photoNodes()[0].querySelector('img')===img,'Unchanged poll recreated img '+i);
          check(img.src===src,'Unchanged poll changed signed image URL '+i);
        }
        check(listCalls>=callsBefore+4,'Polling did not continue');

        remotePhotos[0].caption='変更後の説明';
        await window.__runAlbumPoll();
        check(photoNodes().length===1,'Caption change lost photo');
        check(photoNodes()[0].querySelector('span').textContent==='変更後の説明','Caption change not applied');
        element=photoNodes()[0];img=element.querySelector('img');src=img.src;
        await window.__runAlbumPoll();
        check(photoNodes()[0]===element&&img.src===src,'Steady poll after caption flickered');

        remotePhotos.push({id:'TEST-photo-2',day:'1129',caption:'別の日の写真',created:date+1});
        await window.__runAlbumPoll();
        check(photoNodes().length===2,'Photo addition not reflected');
        element=photoNodes()[0];img=element.querySelector('img');src=img.src;
        await window.__runAlbumPoll();
        check(photoNodes()[0]===element&&img.src===src,'Steady poll after add flickered');

        // Simulate an hour passing. New signed URLs may be saved for later views,
        // but should not replace already loaded thumbnail elements in this view.
        const originalNow=Date.now;
        try{
          Date.now=()=>originalNow()+51*60*1000;
          await window.__runAlbumPoll();
        }finally{Date.now=originalNow}
        check(photoNodes()[0]===element&&img.src===src,'Signed URL renewal flickered');

        document.querySelector('[data-view="info"]').click();
        check(!document.getElementById('view-info').classList.contains('hidden'),'Info tab failed');
        document.querySelector('[data-view="days"]').click();
        check(!document.getElementById('view-days').classList.contains('hidden'),'Days tab failed');
        const count=document.querySelectorAll('#sched li').length;
        document.getElementById('addRow').click();
        check(document.querySelectorAll('#sched li').length===count+1,'Add schedule failed');

        document.body.dataset.albumTest='PASS';
        const pre=document.createElement('pre');pre.id='album-e2e-result';
        pre.textContent='PASS: steady polls keep same images; caption/add/URL refresh; tabs and schedule';
        document.body.append(pre);
      }catch(error){
        document.body.dataset.albumTest='FAIL';
        const pre=document.createElement('pre');pre.id='album-e2e-result';
        pre.textContent='FAIL: '+String(error?.stack||error);
        document.body.append(pre);
      }
    })();
  });
})();