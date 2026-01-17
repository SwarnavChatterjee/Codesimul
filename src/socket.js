import { io } from "socket.io-client";

const socket = io("https://codesimul-backend.onrender.com", {
  autoConnect: false,
});

export default socket;
