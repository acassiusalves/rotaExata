export function legacyRotaStaffAllowed(phase:{mode?:unknown}|undefined) {
  return !phase || phase.mode===undefined || phase.mode==='firebase';
}
