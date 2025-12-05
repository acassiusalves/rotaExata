// ============================================
// SERVIÇO DE PERMISSÕES - FIRESTORE
// Funções para salvar e carregar permissões
// ============================================

import { db } from '@/lib/firebase/client';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { defaultPagePermissions, type RoleKey } from './permissions';

const SETTINGS_COLLECTION = 'settings';
const PERMISSIONS_DOC = 'permissions';

export interface PermissionsSettings {
  permissions: Record<string, string[]>;
  inactivePages: string[];
  updatedAt?: Date;
  updatedBy?: string;
}

// Carregar permissões do Firestore
export async function loadPermissions(): Promise<PermissionsSettings | null> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, PERMISSIONS_DOC);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        permissions: data.permissions || defaultPagePermissions,
        inactivePages: data.inactivePages || [],
        updatedAt: data.updatedAt?.toDate(),
        updatedBy: data.updatedBy,
      };
    }

    // Se não existir, retorna as permissões padrão
    return {
      permissions: defaultPagePermissions,
      inactivePages: [],
    };
  } catch (error) {
    console.error('Erro ao carregar permissões:', error);
    return null;
  }
}

// Salvar permissões no Firestore
export async function savePermissions(
  permissions: Record<string, string[]>,
  inactivePages: string[],
  userId?: string
): Promise<boolean> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, PERMISSIONS_DOC);

    await setDoc(docRef, {
      permissions,
      inactivePages,
      updatedAt: serverTimestamp(),
      updatedBy: userId || 'system',
    });

    return true;
  } catch (error) {
    console.error('Erro ao salvar permissões:', error);
    return false;
  }
}

// Carregar usuários com suas roles
export interface AppUser {
  id: string;
  email: string;
  displayName?: string;
  role: string;
  createdAt?: Date;
  lastSeenAt?: Date;
}

export async function loadUsersWithRoles(): Promise<AppUser[]> {
  try {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);

    const users: AppUser[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      users.push({
        id: doc.id,
        email: data.email || '',
        displayName: data.displayName,
        role: data.role || '',
        createdAt: data.createdAt?.toDate(),
        lastSeenAt: data.lastSeenAt?.toDate(),
      });
    });

    // Ordenar por email
    return users.sort((a, b) => a.email.localeCompare(b.email));
  } catch (error) {
    console.error('Erro ao carregar usuários:', error);
    return [];
  }
}

// Atualizar role de um usuário
export async function updateUserRole(userId: string, newRole: string): Promise<boolean> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      role: newRole,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Erro ao atualizar role do usuário:', error);
    return false;
  }
}

// Verificar se uma página está ativa
export function isPageActive(pagePath: string, inactivePages: string[]): boolean {
  return !inactivePages.includes(pagePath);
}

// Verificar permissão considerando páginas inativas
export function checkPageAccess(
  userRole: string | null,
  pagePath: string,
  permissions: Record<string, string[]>,
  inactivePages: string[]
): { hasAccess: boolean; isActive: boolean } {
  // Admin sempre tem acesso
  if (userRole === 'admin') {
    return { hasAccess: true, isActive: true };
  }

  // Verificar se a página está ativa
  const isActive = isPageActive(pagePath, inactivePages);
  if (!isActive) {
    return { hasAccess: false, isActive: false };
  }

  // Verificar permissão
  if (!userRole) {
    return { hasAccess: false, isActive: true };
  }

  const pagePermissions = permissions[pagePath];
  if (pagePermissions && pagePermissions.includes(userRole)) {
    return { hasAccess: true, isActive: true };
  }

  // Verificar páginas pai
  const parentPath = pagePath.split('/').slice(0, -1).join('/');
  if (parentPath && permissions[parentPath]?.includes(userRole)) {
    return { hasAccess: true, isActive: true };
  }

  return { hasAccess: false, isActive: true };
}
