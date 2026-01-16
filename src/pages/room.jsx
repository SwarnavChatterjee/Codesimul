import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Editor from "@monaco-editor/react";
import socket from "../socket";

function Room() {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const isRemoteUpdate = useRef(false);
 

  /* ---------------- Layout ---------------- */
  const [leftWidth, setLeftWidth] = useState(40);
  const [topRightHeight, setTopRightHeight] = useState(55);

  /* ---------------- Room State ---------------- */
  const [questionLink, setQuestionLink] = useState("");
  const [code, setCode] = useState("// Start coding here...\n");
  const [output, setOutput] = useState("");
  const [timer, setTimer] = useState("00:00");
  const [input, setInput] = useState("");

  const members = [
    { id: 1, name: "You", color: "bg-green-500" },
    { id: 2, name: "User 2", color: "bg-blue-500" },
    { id: 3, name: "User 3", color: "bg-purple-500" },
  ];

  /* ---------------- Whiteboard ---------------- */
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const editorRef = useRef(null);
  const [strokeColor, setStrokeColor] = useState("black");

  /* ---------------- SOCKET ---------------- */
  useEffect(() => {
    socket.connect();
    socket.emit("join-room", roomId);
    return () => socket.disconnect();
  }, [roomId]);

  useEffect(() => {
    socket.on("code-update", (newCode) => {
      isRemoteUpdate.current = true;
      setCode(newCode);
      setTimeout(() => (isRemoteUpdate.current = false), 0);
    });
    return () => socket.off("code-update");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    socket.on("draw", ({ x0, y0, x1, y1, color }) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    });

    socket.on("clear-board", () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    socket.on("open-problem", (link) => {
      window.open(link, "_blank");
    });
   

    return () => {
      socket.off("draw");
      socket.off("clear-board");
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [leftWidth, topRightHeight]);

  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e) => {
    const ctx = canvasRef.current.getContext("2d");
    drawing.current = true;
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = strokeColor;
    ctx.currentX = x;
    ctx.currentY = y;
  };

  const draw = (e) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d");
    const { x, y } = getCanvasPos(e);
    const prevX = ctx.currentX || x;
    const prevY = ctx.currentY || y;
    ctx.lineTo(x, y);
    ctx.stroke();
    socket.emit("draw", {
      roomId,
      x0: prevX,
      y0: prevY,
      x1: x,
      y1: y,
      color: strokeColor,
    });
    ctx.currentX = x;
    ctx.currentY = y;
  };

  const stopDraw = () => {
    drawing.current = false;
  };

  const clearBoard = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    socket.emit("clear-board", roomId);
  };

  /* ---------------- CODE RUNNER ---------------- */
  const handleRunCode = async () => {
    setOutput("Running code...");
    try {
      const res = await fetch("http://localhost:5001/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, input }),
      });
      const data = await res.json();
      setOutput(data.output || "No output");
    } catch {
      setOutput("Error connecting to backend");
    }
  };

  const handleLeaveRoom = () => {
    if (window.confirm("Leave the room?")) navigate("/");
  };

  return (
    <div className="h-screen w-screen bg-slate-900 flex overflow-hidden">
      {/* LEFT */}
      <div className="flex border-r border-slate-700" style={{ width: `${leftWidth}%` }}>
        {/* Members */}
        <div className="w-16 bg-slate-800 border-r border-slate-700 flex flex-col items-center py-4 gap-4">
          <span className="text-xs text-green-400">LIVE</span>
          {members.map((m) => (
            <div key={m.id} className={`w-10 h-10 ${m.color} rounded-full flex items-center justify-center text-white font-bold`}>
              {m.name[0]}
            </div>
          ))}
          <span className="text-xs text-slate-400 mt-auto">{members.length} online</span>
        </div>

        {/* Panels */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Link */}
          <div className="p-4 bg-slate-800 border-b border-slate-700">
            <div className="flex justify-between mb-2">
              <span className="text-white font-semibold text-sm">Question Link</span>
              <span className="text-xs text-slate-400">Room: {roomId}</span>
            </div>
            <div className="flex gap-2">
              <input
                value={questionLink}
                onChange={(e) => setQuestionLink(e.target.value)}
                className="flex-1 bg-slate-700 text-white px-3 py-2 rounded text-sm"
                placeholder="Paste Codeforces / LeetCode link"
              />
              <button
                onClick={() => {
                  if (!questionLink) return;
                  socket.emit("open-problem", { roomId, link: questionLink, sender: socket.id });
                  window.open(questionLink, "_blank");

                }}
               
               
                className="bg-purple-600 text-white px-4 rounded text-sm"
              >
                Load
              </button>
            </div>
          </div>

          {/* Whiteboard */}
          <div className="flex-1 min-h-0 p-4 bg-slate-800">
            <div className="flex justify-between mb-2">
              <span className="text-white font-semibold text-sm">Whiteboard</span>
              <button onClick={clearBoard} className="text-xs text-red-400">
                Clear
              </button>
            </div>
            <div className="relative bg-white rounded h-full">
              <canvas
                ref={canvasRef}
                className="w-full h-full cursor-crosshair"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
              />
              <div className="absolute top-2 left-2 flex gap-2">
                {[
                  { c: "black", cls: "bg-black" },
                  { c: "red", cls: "bg-red-500" },
                  { c: "blue", cls: "bg-blue-500" },
                  { c: "green", cls: "bg-green-500" },
                ].map(({ c, cls }) => (
                  <button key={c} onClick={() => setStrokeColor(c)} className={`w-5 h-5 rounded border ${cls}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Vertical Resizer */}
      <div
        className="w-1 bg-slate-700 hover:bg-purple-500 cursor-col-resize"
        onMouseDown={(e) => {
          const startX = e.clientX;
          const startWidth = leftWidth;
          const move = (e) => {
            const delta = ((e.clientX - startX) / window.innerWidth) * 100;
            setLeftWidth(Math.min(80, Math.max(20, startWidth + delta)));
          };
          const stop = () => {
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
            editorRef.current?.layout();
          };
          document.addEventListener("mousemove", move);
          document.addEventListener("mouseup", stop);
        }}
      />

      {/* RIGHT SIDE */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Editor */}
        <div className="p-4 bg-slate-900 border-b border-slate-700 min-h-0" style={{ height: `${topRightHeight}%` }}>
          <div className="flex justify-between mb-2">
            <span className="text-white font-semibold">Code Editor</span>
            <div className="flex gap-3">
              <input
                value={timer}
                onChange={(e) => setTimer(e.target.value)}
                className="bg-slate-700 text-white px-2 py-1 text-sm rounded w-20"
              />
              <button onClick={handleLeaveRoom} className="bg-red-600 text-white px-3 py-1 rounded text-sm">
                Leave Room
              </button>
            </div>
          </div>
          <div className="w-full h-full min-h-0">
            <Editor
              height="100%"
              defaultLanguage="cpp"
              theme="vs-dark"
              value={code}
              onChange={(value) => {
                const newCode = value || "";
                setCode(newCode);
                if (!isRemoteUpdate.current) {
                  socket.emit("code-change", { roomId, code: newCode });
                }
              }}
              onMount={(editor) => {
                editorRef.current = editor;
                editor.layout();
              }}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 10 },
              }}
            />
          </div>
        </div>

        {/* Horizontal Resizer */}
        <div
          className="h-1 bg-slate-700 hover:bg-purple-500 cursor-row-resize"
          onMouseDown={(e) => {
            const startY = e.clientY;
            const startHeight = topRightHeight;
            const move = (e) => {
              const delta = ((e.clientY - startY) / window.innerHeight) * 100;
              setTopRightHeight(Math.min(80, Math.max(30, startHeight + delta)));
            };
            const stop = () => {
              document.removeEventListener("mousemove", move);
              document.removeEventListener("mouseup", stop);
              editorRef.current?.layout();
            };
            document.addEventListener("mousemove", move);
            document.addEventListener("mouseup", stop);
          }}
        />

        {/* I/O */}
        <div className="flex-1 min-h-0 p-4 bg-slate-900 flex flex-col gap-4">
          <div>
            <span className="text-white font-semibold block mb-2">Input (stdin)</span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter input here (same format as cin)"
              className="w-full h-24 bg-slate-950 text-white p-3 rounded text-sm font-mono resize-none focus:outline-none"
            />
          </div>

          <div className="flex-1 min-h-0">
            <div className="flex justify-between mb-2">
              <span className="text-white font-semibold">Output</span>
              <button onClick={handleRunCode} className="bg-green-600 text-white px-4 py-1 rounded text-sm">
                ▶ Run Code
              </button>
            </div>
            <div className="bg-slate-950 rounded p-4 text-slate-300 font-mono text-sm h-full overflow-auto">
              {output || 'Click "Run Code" to see output'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Room;