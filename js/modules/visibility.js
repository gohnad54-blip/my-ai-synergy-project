/** Content visibility — access algorithm for materials and categories */

/**
 * @typedef {{ userId?: string, role?: string, permissions?: string[] } | null | undefined} SessionLike
 */

/**
 * @param {SessionLike} session
 * @returns {boolean}
 */
function sessionIsAdmin(session) {
  return session?.role === 'admin';
}

/**
 * @param {SessionLike} session
 * @param {string} permission
 * @returns {boolean}
 */
function sessionHasPermission(session, permission) {
  if (!session) {
    return false;
  }
  if (sessionIsAdmin(session)) {
    return true;
  }
  return session.permissions?.includes(permission) ?? false;
}

/**
 * @param {object} material
 * @returns {{ guestAccess: boolean, allAuthenticated: boolean, specificUsers: string[] }}
 */
function getVisibilityFlags(material) {
  return {
    guestAccess: Boolean(material.visibility?.guestAccess ?? material.guestAccess),
    allAuthenticated: Boolean(material.visibility?.allAuthenticated ?? material.allAuthenticated),
    specificUsers: material.visibility?.specificUsers ?? [],
  };
}

/**
 * @param {object} material
 * @param {Map<string, object> | Record<string, object> | null} [categoriesById]
 * @returns {boolean}
 */
function materialGuestAccess(material, categoriesById = null) {
  const flags = getVisibilityFlags(material);

  if (flags.guestAccess) {
    return true;
  }

  if (material.visibility?.guestAccess === false || material.guestAccess === false) {
    return false;
  }

  const categoryId = material.categoryId;
  if (!categoryId || !categoriesById) {
    return false;
  }

  const category = categoriesById instanceof Map
    ? categoriesById.get(categoryId)
    : categoriesById[categoryId];

  return Boolean(category?.guestAccess);
}

/**
 * @param {object} material
 * @param {SessionLike} session
 * @param {Map<string, object> | Record<string, object> | null} [categoriesById]
 * @returns {boolean}
 */
export function canAccess(material, session, categoriesById = null) {
  if (material.deletedAt != null && !sessionIsAdmin(session)) {
    return false;
  }

  if (
    material.status === 'draft'
    && session?.userId !== material.authorId
    && !sessionIsAdmin(session)
  ) {
    return false;
  }

  if (sessionIsAdmin(session)) {
    return true;
  }

  const userId = session?.userId;
  const flags = getVisibilityFlags(material);
  const specificUsers = flags.specificUsers;

  if (userId && specificUsers.includes(userId)) {
    return true;
  }

  if (userId && flags.allAuthenticated) {
    return true;
  }

  if (sessionHasPermission(session, 'content.view.restricted')) {
    return true;
  }

  if (materialGuestAccess(material, categoriesById)) {
    return true;
  }

  return false;
}

/**
 * @param {object[]} allMaterials
 * @param {SessionLike} session
 * @param {Map<string, object> | Record<string, object> | null} [categoriesById]
 * @returns {object[]}
 */
export function getVisibleMaterials(allMaterials, session, categoriesById = null) {
  return allMaterials.filter((material) => canAccess(material, session, categoriesById));
}

/**
 * @param {object} category
 * @param {SessionLike} session
 * @returns {boolean}
 */
export function canAccessCategory(category, session) {
  if (sessionIsAdmin(session)) {
    return true;
  }

  if (sessionHasPermission(session, 'content.view.restricted')) {
    return true;
  }

  if (category?.guestAccess === true) {
    return true;
  }

  return false;
}

/** @typedef {'guest' | 'authenticated' | 'restricted'} VisibilityMode */

/**
 * @param {object} material
 * @returns {{ mode: VisibilityMode, icon: string, label: string }}
 */
export function getVisibilityDisplay(material) {
  if (material.visibility?.guestAccess) {
    return { mode: 'guest', icon: '🌐', label: 'Гості' };
  }
  if (material.visibility?.allAuthenticated) {
    return { mode: 'authenticated', icon: '👤', label: 'Авторизовані' };
  }
  return { mode: 'restricted', icon: '🔒', label: 'Обмежений' };
}

/**
 * @param {VisibilityMode} mode
 * @returns {{ guestAccess: boolean, allAuthenticated: boolean }}
 */
export function nextVisibilityPreset(mode) {
  if (mode === 'restricted') {
    return { guestAccess: true, allAuthenticated: false };
  }
  if (mode === 'guest') {
    return { guestAccess: false, allAuthenticated: true };
  }
  return { guestAccess: false, allAuthenticated: false };
}

export default {
  canAccess,
  getVisibleMaterials,
  canAccessCategory,
  getVisibilityDisplay,
  nextVisibilityPreset,
};
