
"use client";

import React, { useState, useEffect, createContext, useContext } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/client';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Toaster } from '@/components/ui/toaster';

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

  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let visibilityHandler: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Limpar interval anterior se existir
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }

      // Limpar listener anterior se existir
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
      }

      if (user) {
        // User is signed in, fetch role from Firestore
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        let role = 'socio'; // default
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          role = data?.role || 'socio';
          setUserRole(role);
          setMustChangePassword(data?.mustChangePassword || false);
          console.log('👤 [use-auth] Usuário autenticado:', {
            uid: user.uid,
            email: user.email,
            role: role,
            currentStatus: data?.status,
          });
        } else {
          // Handle case where user exists in Auth but not in Firestore
          console.warn(`User ${user.uid} found in Auth but not in Firestore.`);
          setUserRole('socio'); // default role
          setMustChangePassword(false);
        }
        setUser(user);
        console.log('✅ [use-auth] Usuário configurado, role:', role);

        // --- Firestore Presence System (Heartbeat) ---
        console.log('🔍 [use-auth] Verificando se deve configurar presença. Role:', role, 'É motorista?', role === 'driver');
        if (role === 'driver') {
            const userFirestoreRef = doc(db, 'users', user.uid);

            // Atualizar status para online imediatamente
            try {
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

            // Configurar heartbeat para manter o status online
            heartbeatInterval = setInterval(async () => {
                try {
                    await updateDoc(userFirestoreRef, {
                        status: 'online',
                        lastSeenAt: serverTimestamp(),
                    });
                    console.log('💓 [use-auth] Heartbeat enviado - motorista online');
                } catch (err) {
                    console.error('❌ [use-auth] Falha no heartbeat', err);
                }
            }, 30000); // Atualiza a cada 30 segundos

            // Marcar offline quando a aba fica visível novamente
            visibilityHandler = async () => {
                if (!document.hidden) {
                    console.log('✅ [use-auth] Aba visível - garantindo status online');
                    try {
                        await updateDoc(userFirestoreRef, {
                            status: 'online',
                            lastSeenAt: serverTimestamp(),
                        });
                    } catch (err) {
                        console.error('❌ [use-auth] Erro ao atualizar status', err);
                    }
                }
            };

            document.addEventListener('visibilitychange', visibilityHandler);
        }
        // --- End Presence ---

      } else {
        setUser(null);
        setUserRole(null);
        setMustChangePassword(false);
      }
      console.log('🔄 [use-auth] Finalizando onAuthStateChanged, definindo loading = false');
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    return signInWithEmailAndPassword(auth, email, pass);
  }

  const signOut = async () => {
    setLoading(true);
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          status: 'offline',
          lastSeenAt: serverTimestamp(),
        });
        console.log('✅ [use-auth] Status atualizado para OFFLINE no signOut');
      } catch (err) {
        console.error('❌ [use-auth] Falha ao registrar status offline no signOut', err);
      }
    }
    await firebaseSignOut(auth);
    setUser(null);
    setUserRole(null);
    setMustChangePassword(false);
    setLoading(false);
    // Redireciona usando window.location para evitar problemas com hooks
    window.location.href = '/login';
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
