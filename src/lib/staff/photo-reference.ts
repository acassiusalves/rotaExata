export const staffPhotoReferencePrefix='/api/staff/media/';
export const isStaffPhotoReference=(src:string)=>src.startsWith(staffPhotoReferencePrefix) &&
  /^legacy\.[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(src.slice(staffPhotoReferencePrefix.length));
