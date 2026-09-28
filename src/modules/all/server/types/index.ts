export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
