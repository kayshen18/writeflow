import { io } from "socket.io-client";

const token = localStorage.getItem(
  "writeflow_token",
);

export const socket = io(
  "http://localhost:3000",
  {
    autoConnect: false,
    transports: ["websocket"],
    auth: {
      token,
    },
  },
);