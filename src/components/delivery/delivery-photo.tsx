'use client';

import {useEffect,useState,type ImgHTMLAttributes} from 'react';
import {useOptionalDriverRuntime} from '@/components/driver/driver-runtime';
import {useAuth} from '@/hooks/auth-context';
import {usePathname} from 'next/navigation';
import {useOptionalStaff} from '@/components/staff/staff-session';
import {staffEditorSurface} from '@/lib/staff/access';
import {staffPhotoViewForPath} from '@/lib/staff/media-policy';
import {isStaffPhotoReference} from '@/lib/staff/photo-reference';
import {nativeStaffEnabled} from '@/lib/staff/mode';
import {protectedPhotoPrefix,isProtectedPhoto} from '@/lib/driver/photo-policy';

export function DeliveryPhoto({src,expand,alt,...props}:Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {src:string;expand?:boolean}) {
  const runtime=useOptionalDriverRuntime();
  const staff=useOptionalStaff();
  const inStaff=!!staff;
  const pathname=usePathname();
  const staffView=staffPhotoViewForPath(pathname);
  const editor=staffEditorSurface(pathname);
  const {user}=useAuth();
  const request=staff?.request ?? runtime?.request;
  const actor=staff?.userId ?? runtime?.userId ?? user?.uid;
  const bridged=isStaffPhotoReference(src);
  const protectedSource=isProtectedPhoto(src) || bridged;
  const staffSource=staff && staffView && protectedSource ?
    (bridged ? src : '/api/staff/media/'+src.slice(protectedPhotoPrefix.length))+'?view='+staffView+
      (editor ? '&editor='+encodeURIComponent(JSON.stringify(editor)):''):null;
  const native=runtime?.native;
  const assistMode=!!runtime?.assist;
  const [loaded,setLoaded]=useState<{src:string;actor?:string;url?:string}>();
  useEffect(()=>{
    if (!protectedSource || !actor) return;
    const controller=new AbortController();
    let objectUrl:string|undefined;
    async function load() {
      const headers={'x-rota-media-mode':request ? assistMode ? 'assist':native ? 'native':'legacy-driver':'operator'};
      let result:{src:string};
      if (inStaff) {
        if (!staffSource || !request) throw new Error('photo unavailable');
        result=await request(staffSource,{signal:controller.signal});
      } else if (request) result=await request(src,{headers,signal:controller.signal});
      else {
        if (!user) return;
        const response=await fetch(src,{headers:{...headers,Authorization:'Bearer '+await user.getIdToken()},
          signal:controller.signal,cache:'no-store',redirect:'error'});
        if (!response.ok) throw new Error('photo unavailable');
        result=await response.json();
      }
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(result.src)) throw new Error('photo unavailable');
      const bytes=await (await fetch(result.src)).blob();
      if (controller.signal.aborted) return;
      objectUrl=URL.createObjectURL(bytes);
      setLoaded({src,actor,url:objectUrl});
    }
    void load().catch(()=>{if(!controller.signal.aborted) setLoaded({src,actor});});
    return ()=>{controller.abort();if(objectUrl) URL.revokeObjectURL(objectUrl);};
  },[actor,native,assistMode,protectedSource,request,src,staffSource,inStaff,user]);

  const current=loaded?.src===src && loaded.actor===actor ? loaded:undefined;
  const url=protectedSource ? current?.url:nativeStaffEnabled && staffView ? undefined:src;
  if (!url) return <p role="status" className="text-sm text-muted-foreground">{current?'Comprovante indisponível.':'Carregando comprovante…'}</p>;
  const image=<img {...props} src={url} alt={alt} />;
  return expand ? <a href={url} target="_blank" rel="noopener noreferrer">{image}</a>:image;
}
