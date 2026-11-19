"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.legacyRotaStaffAllowed = legacyRotaStaffAllowed;
function legacyRotaStaffAllowed(phase) {
    return !phase || phase.mode === undefined || phase.mode === 'firebase';
}
//# sourceMappingURL=legacy-staff-cutover.js.map