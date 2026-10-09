const API_BASE_URL = "http://localhost:3000/api";

type ApiErrorResponse = {
  message?: string;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = (await response.json()) as T & ApiErrorResponse;

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong.");
  }

  return data;
}

export type LoggedInUser = {
  id: string;
  email: string;
  displayName: string;
  avatarPath: string | null;
};

type RegisterResponse = {
  message: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
};

type LoginResponse = {
  message: string;
  token: string;
  user: LoggedInUser;
};

export function registerUser(
  email: string,
  password: string,
  displayName: string,
) {
  return request<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function loginUser(email: string, password: string) {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function saveSession(token: string, user: LoggedInUser) {
  localStorage.setItem("writeflow_token", token);
  localStorage.setItem("writeflow_user", JSON.stringify(user));
}

export function getSavedUser(): LoggedInUser | null {
  const savedUser = localStorage.getItem("writeflow_user");

  if (!savedUser) {
    return null;
  }

  try {
    return JSON.parse(savedUser) as LoggedInUser;
  } catch {
    localStorage.removeItem("writeflow_user");
    return null;
  }
}

export function logoutUser() {
  localStorage.removeItem("writeflow_token");
  localStorage.removeItem("writeflow_user");
}

export type MyWork = {
  id: string;
  author_id: string;
  owner_name: string;
  access_role: "owner" | "editor" | "viewer";
  title: string;
  work_type: "writing" | "drawing";
  content_json: unknown;
  created_at: string;
  updated_at: string;
};

export function getMyWorks() {
  const token = localStorage.getItem("writeflow_token");

  if (!token) {
    throw new Error("You must be logged in.");
  }

  return request<{ works: MyWork[] }>("/my/works", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export type OwnedWork = {
  id: string;
  author_id: string;
  current_version: number;
  access_role: "owner" | "editor" | "viewer";
  title: string;
  work_type: "writing" | "drawing";
  content_json: unknown;
  description: string;
  cover_path: string | null;
  category: string | null;
  tags: string[] | null;
  is_published: boolean;
  allow_comments: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function getAuthHeaders() {
  const token = localStorage.getItem("writeflow_token");

  if (!token) {
    throw new Error("You must be logged in.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export function getMyWork(workId: string) {
  return request<{ work: OwnedWork }>(`/my/works/${workId}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
}

export function createMyWork(
  title: string,
  workType: "writing" | "drawing",
  contentJson: unknown,
) {
  return request<{
    message: string;
    work: {
      id: string;
      title: string;
      workType: "writing" | "drawing";
      contentJson: unknown;
    };
  }>("/my/works", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      title,
      workType,
      contentJson,
    }),
  });
}

export function updateMyWork(
  workId: string,
  title: string,
  contentJson: unknown,
) {
  return request<{
    message: string;
    work: {
      id: string;
      title: string;
      contentJson: unknown;
    };
  }>(`/my/works/${workId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      title,
      contentJson,
    }),
  });
}

export type UploadedImage = {
  filePath: string;
  url: string;
  alt: string;
};

export async function uploadWorkImages(files: File[]) {
  const token = localStorage.getItem("writeflow_token");

  if (!token) {
    throw new Error("You must be logged in.");
  }

  const formData = new FormData();

  for (const file of files) {
    formData.append("images", file);
  }

  const response = await fetch(
    `${API_BASE_URL}/uploads/images`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    },
  );

  const data = (await response.json()) as {
    message?: string;
    images?: UploadedImage[];
  };

  if (!response.ok) {
    throw new Error(data.message || "Image upload failed.");
  }

  return {
    images: data.images ?? [],
  };
}

export async function deleteUploadedImages(paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  const token = localStorage.getItem("writeflow_token");

  if (!token) {
    throw new Error("You must be logged in.");
  }

  const response = await fetch(
    `${API_BASE_URL}/uploads/images`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paths }),
    },
  );

  const data = (await response.json()) as {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message || "Image deletion failed.");
  }
}

export function deleteMyWork(workId: string) {
  return request<{ message: string }>(`/my/works/${workId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export function publishMyWork(
  workId: string,
  data: {
    title: string;
    description: string;
    category: string;
    tags: string[];
    allowComments: boolean;
    coverPath: string | null;
  },
) {
  return request<{ message: string }>(
    `/my/works/${workId}/publication`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    },
  );
}

export type PublishedWork = {
  id: string;
  title: string;
  description: string;
  cover_path: string | null;
  category: string | null;
  tags: string[] | null;
  work_type: "writing" | "drawing";
  published_at: string | null;
  author_id: string;
  author_name: string | null;
  author_avatar_path: string | null;
};

export function getPublishedWorks() {
  return request<{ works: PublishedWork[] }>("/works");
}

export function getUploadUrl(filePath: string) {
  return `http://localhost:3000/uploads/${filePath}`;
}

export function getPublishedWork(workId: string) {
  return request<{
    work: PublishedWork & {
      content_json: unknown;
      allow_comments: boolean;
    };
  }>(`/works/${workId}`);
}

export function getLikeStatus(workId: string) {
  return request<{
    likeCount: number;
    liked: boolean;
  }>(`/works/${workId}/like-status`, {
    headers: getAuthHeaders(),
  });
}

export function likeWork(workId: string) {
  return request<{ message: string }>(
    `/works/${workId}/like`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    },
  );
}

export function unlikeWork(workId: string) {
  return request<{ message: string }>(
    `/works/${workId}/like`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  );
}

export function getBookmarkStatus(workId: string) {
  return request<{ bookmarked: boolean }>(
    `/works/${workId}/bookmark-status`,
    {
      headers: getAuthHeaders(),
    },
  );
}

export function bookmarkWork(workId: string) {
  return request<{ message: string }>(
    `/works/${workId}/bookmark`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    },
  );
}

export function removeBookmark(workId: string) {
  return request<{ message: string }>(
    `/works/${workId}/bookmark`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  );
}

export function getSavedWorks() {
  return request<{ works: PublishedWork[] }>("/my/bookmarks", {
    headers: getAuthHeaders(),
  });
}

export function getLikedWorks() {
  return request<{ works: PublishedWork[] }>("/my/likes", {
    headers: getAuthHeaders(),
  });
}

export type WorkComment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_name: string;
  author_avatar_path: string | null;
};

export function getWorkComments(workId: string) {
  return request<{ comments: WorkComment[] }>(
    `/works/${workId}/comments`,
  );
}

export function createWorkComment(
  workId: string,
  content: string,
) {
  return request<{
    message: string;
    commentId: string;
  }>(`/works/${workId}/comments`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ content }),
  });
}

export type UserProfile = {
  id: string;
  email: string;
  display_name: string;
  avatar_path: string | null;
  bio: string;
  created_at: string;
};

export function getMyProfile() {
  return request<{ user: UserProfile }>("/my/profile", {
    headers: getAuthHeaders(),
  });
}

export function updateMyProfile(data: {
  displayName: string;
  bio: string;
  avatarPath: string | null;
}) {
  return request<{ message: string }>("/my/profile", {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export function unpublishMyWork(workId: string) {
  return request<{ message: string }>(
    `/my/works/${workId}/unpublish`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
    },
  );
}

export function deleteWorkComment(commentId: string) {
  return request<{ message: string }>(
    `/comments/${commentId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  );
}

export function getFollowStatus(userId: string) {
  return request<{ following: boolean }>(
    `/users/${userId}/follow-status`,
    {
      headers: getAuthHeaders(),
    },
  );
}

export function followUser(userId: string) {
  return request<{ message: string }>(
    `/users/${userId}/follow`,
    {
      method: "POST",
      headers: getAuthHeaders(),
    },
  );
}

export function unfollowUser(userId: string) {
  return request<{ message: string }>(
    `/users/${userId}/follow`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  );
}

export type FollowedCreator = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  bio: string;
  followed_at: string;
};

export function getFollowedCreators() {
  return request<{ creators: FollowedCreator[] }>("/my/following", {
    headers: getAuthHeaders(),
  });
}

export type CreatorProfile = {
  id: string;
  display_name: string;
  avatar_path: string | null;
  bio: string;
  created_at: string;
};

export function getCreatorProfile(creatorId: string) {
  return request<{
    creator: CreatorProfile;
    works: PublishedWork[];
  }>(`/creators/${creatorId}`);
}

export type Collaborator = {
  id: string;
  email: string;
  display_name: string;
  avatar_path: string | null;
  role: "editor" | "viewer";
};

export function getCollaborators(workId: string) {
  return request<{ collaborators: Collaborator[] }>(
    `/my/works/${workId}/collaborators`,
    {
      headers: getAuthHeaders(),
    },
  );
}

export function addCollaborator(
  workId: string,
  email: string,
  role: "editor" | "viewer",
) {
  return request<{ message: string }>(
    `/my/works/${workId}/collaborators`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ email, role }),
    },
  );
}

export function removeCollaborator(
  workId: string,
  userId: string,
) {
  return request<{ message: string }>(
    `/my/works/${workId}/collaborators/${userId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  );
}

export type PrivateDraft = {
  id: string;
  draft_title: string;
  draft_content_json: unknown;
  base_version: number;
  created_at: string;
  updated_at: string;
};

export function getMyDraft(workId: string) {
  return request<{
    currentVersion: number;
    draft: PrivateDraft | null;
  }>(`/my/works/${workId}/draft`, {
    headers: getAuthHeaders(),
  });
}

export function saveMyDraft(
  workId: string,
  data: {
    title: string;
    contentJson: unknown;
    baseVersion: number;
  },
) {
  return request<{
    message: string;
  }>(`/my/works/${workId}/draft`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
}

export function submitChangeRequest(workId: string) {
  return request<{
    message: string;
    changeRequestId: string;
  }>(`/my/works/${workId}/change-requests`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

export type ChangeRequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "withdrawn";

export type WorkChangeRequest = {
  id: string;
  work_id: string;
  requester_id: string;
  draft_id: string | null;

  submitted_title: string;
  submitted_content_json: unknown;
  base_version: number;

  status: ChangeRequestStatus;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;

  created_at: string;
  updated_at: string;

  requester_name: string;
  requester_avatar_path: string | null;
};

export function getWorkChangeRequests(
  workId: string,
  status: ChangeRequestStatus = "pending",
) {
  return request<{
    requests: WorkChangeRequest[];
  }>(
    `/my/works/${workId}/change-requests?status=${status}`,
    {
      headers: getAuthHeaders(),
    },
  );
}

export function reviewChangeRequest(
  workId: string,
  changeRequestId: string,
  data: {
    decision: "accept" | "reject";
    reviewComment?: string;
  },
) {
  return request<{
    message: string;
    currentVersion?: number;
  }>(
    `/my/works/${workId}/change-requests/${changeRequestId}/review`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    },
  );
}

export type MyChangeRequest = {
  id: string;
  submitted_title: string;
  base_version: number;
  status: ChangeRequestStatus;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function getMyChangeRequests(workId: string) {
  return request<{
    requests: MyChangeRequest[];
  }>(
    `/my/works/${workId}/change-requests/mine`,
    {
      headers: getAuthHeaders(),
    },
  );
}

export function withdrawChangeRequest(
  workId: string,
  changeRequestId: string,
) {
  return request<{ message: string }>(
    `/my/works/${workId}/change-requests/${changeRequestId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  );
}

export function reloadMyDraft(workId: string) {
  return request<{
    message: string;
    draft: {
      title: string;
      contentJson: unknown;
      baseVersion: number;
    };
  }>(`/my/works/${workId}/draft/reload`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

export type NotificationType =
  | "change_submitted"
  | "change_accepted"
  | "change_rejected";

export type WriteFlowNotification = {
  id: string;
  notification_type: NotificationType;
  message: string;
  work_id: string | null;
  is_read: boolean;
  created_at: string;
};

export function getMyNotifications() {
  return request<{
    notifications: WriteFlowNotification[];
  }>("/my/notifications", {
    headers: getAuthHeaders(),
  });
}

export function markNotificationAsRead(
  notificationId: string,
) {
  return request<{
    message: string;
  }>(`/my/notifications/${notificationId}/read`, {
    method: "PUT",
    headers: getAuthHeaders(),
  });
}

export function markAllNotificationsAsRead() {
  return request<{
    message: string;
  }>("/my/notifications/read-all", {
    method: "PUT",
    headers: getAuthHeaders(),
  });
}

export type Project = {
  id: string;
  title: string;
  description: string;
  cover_path: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
};

export function getMyProjects() {
  return request<{
    projects: Project[];
  }>("/my/projects", {
    headers: getAuthHeaders(),
  });
}

export function createProject(
  title: string,
  description: string,
) {
  return request<{
    message: string;
    project: {
      id: string;
      title: string;
      description: string;
      coverPath: string | null;
      itemCount: number;
    };
  }>("/my/projects", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      title,
      description,
    }),
  });
}

export type ProjectItemRole =
  | "chapter"
  | "character"
  | "scene"
  | "cover"
  | "inspiration"
  | "other";

export type ProjectDetail = {
  id: string;
  title: string;
  description: string;
  cover_path: string | null;
  category: string | null;
  tags: string[] | string;
  is_published: boolean;
  allow_comments: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectItem = {
  project_item_id: string;
  item_role: ProjectItemRole;
  sort_order: number;
  added_at: string;

  work_id: string;
  work_title: string;
  work_type: "writing" | "drawing";
  work_updated_at: string;
};

export function getMyProject(projectId: string) {
  return request<{
    project: ProjectDetail;
    items: ProjectItem[];
  }>(`/my/projects/${projectId}`, {
    headers: getAuthHeaders(),
  });
}

export function addWorkToProject(
  projectId: string,
  workId: string,
  itemRole: ProjectItemRole,
) {
  return request<{
    message: string;
    item: {
      id: string;
      workId: string;
      itemRole: ProjectItemRole;
      sortOrder: number;
    };
  }>(`/my/projects/${projectId}/items`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      workId,
      itemRole,
    }),
  });
}

export function removeWorkFromProject(
  projectId: string,
  projectItemId: string,
) {
  return request<{
    message: string;
  }>(
    `/my/projects/${projectId}/items/${projectItemId}`,
    {
      method: "DELETE",
      headers: getAuthHeaders(),
    },
  );
}

export function deleteMyProject(projectId: string) {
  return request<{
    message: string;
  }>(`/my/projects/${projectId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export function updateMyProject(
  projectId: string,
  title: string,
  description: string,
) {
  return request<{
    message: string;
    project: {
      id: string;
      title: string;
      description: string;
    };
  }>(`/my/projects/${projectId}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      title,
      description,
    }),
  });
}

export function updateProjectCover(
  projectId: string,
  coverPath: string | null,
) {
  return request<{
    message: string;
    coverPath: string | null;
  }>(`/my/projects/${projectId}/cover`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      coverPath,
    }),
  });
}

export function reorderProjectItems(
  projectId: string,
  itemIds: string[],
) {
  return request<{
    message: string;
  }>(`/my/projects/${projectId}/items/reorder`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      itemIds,
    }),
  });
}

export function updateProjectItemRole(
  projectId: string,
  projectItemId: string,
  itemRole: ProjectItemRole,
) {
  return request<{
    message: string;
    itemRole: ProjectItemRole;
  }>(
    `/my/projects/${projectId}/items/${projectItemId}/role`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        itemRole,
      }),
    },
  );
}

export type PublishedProject = {
  id: string;
  title: string;
  description: string;
  cover_path: string | null;
  category: string | null;
  tags: string[] | string;
  published_at: string | null;
  author_id: string;
  author_name: string;
  author_avatar_path: string | null;
  item_count: number;
  like_count: number;
};

export type PublicProjectItem = {
  project_item_id: string;
  item_role: ProjectItemRole;
  sort_order: number;
  work_id: string;
  work_title: string;
  work_type: "writing" | "drawing";
  content_json: unknown;
  work_updated_at: string;
};

export type PublishedProjectDetail = PublishedProject & {
  allow_comments: boolean;
};

export type ProjectComment = {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_name: string;
  author_avatar_path: string | null;
};

export function publishMyProject(
  projectId: string,
  publication: {
    title: string;
    description: string;
    category: string;
    tags: string[];
    allowComments: boolean;
  },
) {
  return request<{ message: string }>(
    `/my/projects/${projectId}/publication`,
    {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(publication),
    },
  );
}

export function unpublishMyProject(projectId: string) {
  return request<{ message: string }>(
    `/my/projects/${projectId}/publication`,
    { method: "DELETE", headers: getAuthHeaders() },
  );
}

export function getPublishedProjects() {
  return request<{ projects: PublishedProject[] }>("/projects");
}

export function getPublishedProject(projectId: string) {
  return request<{
    project: PublishedProjectDetail;
    items: PublicProjectItem[];
  }>(`/projects/${projectId}`);
}

export function getProjectEngagement(projectId: string) {
  return request<{
    likeCount: number;
    liked: boolean;
    bookmarked: boolean;
  }>(`/projects/${projectId}/engagement`, {
    headers: getAuthHeaders(),
  });
}

export function likeProject(projectId: string) {
  return request<{ message: string }>(`/projects/${projectId}/like`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

export function unlikeProject(projectId: string) {
  return request<{ message: string }>(`/projects/${projectId}/like`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export function bookmarkProject(projectId: string) {
  return request<{ message: string }>(`/projects/${projectId}/bookmark`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
}

export function removeProjectBookmark(projectId: string) {
  return request<{ message: string }>(`/projects/${projectId}/bookmark`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}

export function getProjectComments(projectId: string) {
  return request<{ comments: ProjectComment[] }>(
    `/projects/${projectId}/comments`,
  );
}

export function createProjectComment(projectId: string, content: string) {
  return request<{ message: string; commentId: string }>(
    `/projects/${projectId}/comments`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ content }),
    },
  );
}

export function deleteProjectComment(commentId: string) {
  return request<{ message: string }>(`/project-comments/${commentId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
}
