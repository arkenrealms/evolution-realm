export async function testBanSystem(app) {
  const target = '0x2d4c407bbe49438ed859fe965b140dcf1aab71a9';
  return await app.realm.call('BanPlayerRequest', {
    target,
  });
}

export async function testRoundFinished(app) {
  const target = '0x2d4c407bbe49438ed859fe965b140dcf1aab71a9';
  return await app.realm.call('RoundFinishedRequest', {
    target,
  });
}
