const admin = require('firebase-admin');

// Initialize with default credentials
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'rota-exata'
  });
}

const db = admin.firestore();

async function checkWarley() {
  console.log('=== Buscando motorista Warley Andrade ===\n');
  
  // Buscar o motorista Warley
  const usersSnapshot = await db.collection('users')
    .where('role', '==', 'driver')
    .get();
  
  let warleyId = null;
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    const name = data.displayName || data.name || '';
    if (name.toLowerCase().includes('warley')) {
      console.log('Motorista encontrado:');
      console.log('  ID:', doc.id);
      console.log('  Nome:', name);
      console.log('  Email:', data.email);
      console.log('  Status:', data.status);
      console.log('');
      warleyId = doc.id;
    }
  });
  
  if (!warleyId) {
    console.log('Motorista Warley não encontrado!');
    return;
  }
  
  console.log('=== Buscando rotas do motorista ===\n');
  
  // Buscar todas as rotas do motorista
  const routesSnapshot = await db.collection('routes')
    .where('driverId', '==', warleyId)
    .get();
  
  if (routesSnapshot.empty) {
    console.log('Nenhuma rota encontrada para este motorista!');
    
    // Buscar rotas recentes para ver se alguma tem driverInfo com Warley
    console.log('\n=== Verificando rotas recentes ===\n');
    const recentRoutes = await db.collection('routes')
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();
    
    recentRoutes.forEach(doc => {
      const data = doc.data();
      console.log('Rota:', doc.id);
      console.log('  Nome:', data.name);
      console.log('  Status:', data.status);
      console.log('  driverId:', data.driverId);
      console.log('  driverInfo:', data.driverInfo?.name || 'N/A');
      console.log('  createdAt:', data.createdAt?.toDate?.() || data.createdAt);
      console.log('');
    });
  } else {
    console.log('Encontradas ' + routesSnapshot.size + ' rota(s):\n');
    routesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log('Rota:', doc.id);
      console.log('  Nome:', data.name);
      console.log('  Status:', data.status);
      console.log('  plannedDate:', data.plannedDate?.toDate?.() || data.plannedDate);
      console.log('  Paradas:', data.stops?.length || 0);
      console.log('');
    });
  }
}

checkWarley().catch(console.error).finally(() => process.exit());
