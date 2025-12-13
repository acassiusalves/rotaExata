
"use client";

import React, { useState, useEffect, createContext, useContext } from 'react';
import { User, UserCredential, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase/client';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Toaster } from '@/components/ui/toaster';
import { createLogger } from '@/lib/logger';

const log = createLogger('AuthProvider');

interface AuthContextType {
  user: User | null;
  userRole: string | null;
  mustChangePassword?: boolean;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<UserCredential>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userRole: null,
    mustChangePassword: false,
    loading: true,
    signIn: async () => { throw new Error('AuthProvider not initialized'); },
    signOut: async () => { throw new Error('AuthProvider not initialized'); },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let visibilityHandler: (() => void) | null = null;
    let listenerActive = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!listenerActive) {
        return;
      }

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
        let role: string | null = null;
        let firestoreSuccess = false;

        try {
          // Adiciona timeout de 10s para evitar travamento
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Firestore timeout após 10s')), 10000);
          });

          const userDocSnap = await Promise.race([
            getDoc(userDocRef),
            timeoutPromise
          ]);

          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            role = data?.role || 'socio';
            setUserRole(role);
            setMustChangePassword(data?.mustChangePassword || false);
            log.debug('Usuário autenticado:', {
              uid: user.uid,
              email: user.email,
              role: role,
              currentStatus: data?.status,
            });
          } else {
            // Handle case where user exists in Auth but not in Firestore
            log.warn(`User ${user.uid} found in Auth but not in Firestore.`);
            role = 'socio'; // default role
            setUserRole(role);
            setMustChangePassword(false);
          }
          setUser(user);
          firestoreSuccess = true;
        } catch (firestoreError) {
          console.error('Firestore error:', firestoreError);

          // SEGURANÇA: NÃO dar role quando Firestore falha!
          // Isso evita que usuários ganhem acesso indevido por problema de conexão.
          // Fazemos logout para forçar nova tentativa.
          try {
            await firebaseSignOut(auth);
          } catch {
            // Ignora erro de logout
          }

          setUser(null);
          setUserRole(null);
          setMustChangePassword(false);
          role = null;

          // Mostrar erro para o usuário
          alert('Erro de conexão com o servidor. Por favor, verifique sua internet e tente novamente.');
        }

        // --- Firestore Presence System (Heartbeat) ---
        // Só configura presença se o Firestore funcionou E o usuário é driver
        if (firestoreSuccess && role === 'driver') {
            const userFirestoreRef = doc(db, 'users', user.uid);

            // Atualizar status para online imediatamente
            try {
                await updateDoc(userFirestoreRef, {
                    status: 'online',
                    lastSeenAt: serverTimestamp(),
                });
                log.debug('Status do motorista atualizado para ONLINE no Firestore', {
                    userId: user.uid,
                    email: user.email,
                    status: 'online',
                });
            } catch (err) {
                log.error('Falha ao registrar presença do motorista', err);
            }

            // Configurar heartbeat para manter o status online
            heartbeatInterval = setInterval(async () => {
                try {
                    await updateDoc(userFirestoreRef, {
                        status: 'online',
                        lastSeenAt: serverTimestamp(),
                    });
                } catch (err) {
                    log.error('Falha no heartbeat', err);
                }
            }, 30000); // Atualiza a cada 30 segundos

            // Marcar online quando a aba fica visível novamente
            visibilityHandler = async () => {
                if (!document.hidden) {
                    try {
                        await updateDoc(userFirestoreRef, {
                            status: 'online',
                            lastSeenAt: serverTimestamp(),
                        });
                    } catch (err) {
                        log.error('Erro ao atualizar status', err);
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
      setLoading(false);
    });

    return () => {
      listenerActive = false;
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
      } catch (err) {
        log.error('Falha ao registrar status offline no signOut', err);
      }
    }
    await firebaseSignOut(auth);
    setUser(null);
    setUserRole(null);
    setMustChangePassword(false);
    setLoading(false);
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
