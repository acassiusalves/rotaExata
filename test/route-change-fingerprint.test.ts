import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import { Timestamp as BrowserTimestamp } from 'firebase/firestore';
import { getRouteChangeNotificationFingerprint } from '../src/lib/route-change-fingerprint.ts';

test('the same notice has the same fingerprint in Firebase browser and Admin SDKs', () => {
  const notice = { routeId: 'route-a', driverId: 'driver-a', changes: [] };
  const seconds = 1795000000;
  const nanos = 123456789;
  const browser = getRouteChangeNotificationFingerprint({ ...notice, createdAt: new BrowserTimestamp(seconds,nanos) });
  const admin = getRouteChangeNotificationFingerprint({ ...notice, createdAt: new AdminTimestamp(seconds,nanos) });
  assert.equal(admin,browser);
});
