
"use client";

import React, { useState, useEffect, createContext, useContext } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/client';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { Toaster } from '@/components/ui/toaster';
import { getDatabase, ref, onValue, goOnline, goOffline, onDisconnect, set, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  mustChangePassword?: boolean;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<any>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userRole: null,
    mustChangePassword: false,
    loading: true,
    signIn: async () => {},
    signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is signed in, fetch role from Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        let role = 'vendedor'; // default
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          role = data?.role || 'vendedor';
          setUserRole(role);
          setMustChangePassword(data?.mustChangePassword || false);
        } else {
          // Handle case where user exists in Auth but not in Firestore
          console.warn(`User ${user.uid} found in Auth but not in Firestore.`);
          setUserRole('vendedor'); // default role
          setMustChangePassword(false);
        }
        setUser(user);
        
        // --- Firebase Realtime Database Presence ---
        if (role === 'driver') {
            const rtdb = getDatabase();
            const userStatusDatabaseRef = ref(rtdb, '/status/' + user.uid);
            const userFirestoreRef = doc(db, 'users', user.uid);

            const isOfflineForDatabase = {
                state: 'offline',
                last_changed: rtdbServerTimestamp(),
            };
            const isOnlineForDatabase = {
                state: 'online',
                last_changed: rtdbServerTimestamp(),
            };

            const connectedRef = ref(rtdb, '.info/connected');
            onValue(connectedRef, async (snapshot) => {
                if (snapshot.val() === false) {
                    try {
                        await updateDoc(userFirestoreRef, {
                            status: 'offline',
                            lastSeenAt: serverTimestamp(),
                        });
                        console.log('⚠️ [use-auth] Conexão perdida - Status atualizado para OFFLINE', {
                            userId: user.uid,
                            status: 'offline'
                        });
                    } catch (err) {
                        console.error('❌ [use-auth] Falha ao registrar status offline', err);
                    }
                    return;
                }

                goOnline(rtdb);

                try {
                    await onDisconnect(userStatusDatabaseRef).set(isOfflineForDatabase);
                    await set(userStatusDatabaseRef, isOnlineForDatabase);
                    await updateDoc(userFirestoreRef, {
                        status: 'online',
                        lastSeenAt: serverTimestamp(),
                    });
                    console.log('✅ [use-auth] Status do motorista atualizado para ONLINE no Firestore', {
                        userId: user.uid,
                        email: user.email,
                        status: 'online',
                        timestamp: new Date().toISOString()
                    });
                } catch (err) {
                    console.error('❌ [use-auth] Falha ao registrar presença do motorista', err);
                }
            });
        }
        // --- End Presence ---

      } else {
        setUser(null);
        setUserRole(null);
        setMustChangePassword(false);
        // Ensure RTDB connection is closed on sign out
        const rtdb = getDatabase();
        goOffline(rtdb);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const signIn = async (email: string, pass: string) => {
    return signInWithEmailAndPassword(auth, email, pass);
  }

  const signOut = async () => {
    setLoading(true);
    // Disconnect from RTDB before signing out
    const rtdb = getDatabase();
    goOffline(rtdb);
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          status: 'offline',
          lastSeenAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Falha ao registrar status offline no signOut', err);
      }
    }
    await firebaseSignOut(auth);
    setUser(null);
    setUserRole(null);
    setMustChangePassword(false);
    router.push('/login');
    setLoading(false);
  };

  const value = {
    user,
    userRole,
    mustChangePassword,
    loading,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
       <>
        {children}
        <Toaster />
       </>
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
