
"use strict";
var ffmpeg_ffmpeg_worker,
  hasRequiredFfmpeg_ffmpeg_worker;
function requireFfmpeg_ffmpeg_worker() {
  if (hasRequiredFfmpeg_ffmpeg_worker)
    return ffmpeg_ffmpeg_worker;
  hasRequiredFfmpeg_ffmpeg_worker = 1;
  const e = {
      LOAD: "FFMPEG_LOAD",
      EXEC: "FFMPEG_EXEC",
      WRITE_FILE: "FFMPEG_WRITE_FILE",
      READ_FILE: "FFMPEG_READ_FILE",
      DELETE_FILE: "FFMPEG_DELETE_FILE",
      RENAME: "FFMPEG_RENAME",
      CREATE_DIR: "FFMPEG_CREATE_DIR",
      LIST_DIR: "FFMPEG_LIST_DIR",
      DELETE_DIR: "FFMPEG_DELETE_DIR",
      ERROR: "FFMPEG_ERROR"
    },
    t = {
      MOUNT: "MOUNT",
      UNMOUNT: "UNMOUNT",
      FS: "FS",
      FETCH: "FETCH",
      LOG: "LOG",
      PROGRESS: "PROGRESS",
      ABORT: "ABORT",
      ...e
    },
    r = (e => new Error(e)),
    n = r("unknown message type"),
    o = r("ffmpeg is not loaded, call `await ffmpeg.load()` first");
  var i, a, s = (i = function(e, t) {
    return (i = Object.setPrototypeOf || {
        __proto__: []
      }
      instanceof Array && function(e, t) {
        e.__proto__ = t
      } || function(e, t) {
        for (var r in t) Object.prototype.hasOwnProperty.call(t, r) && (e[r] = t[r])
      })(e, t)
  }, function(e, t) {
    if ("function" != typeof t && null !== t) throw new TypeError("Class extends value " + String(t) + " is not a constructor or null");

    function r() {
      this.constructor = e
    }
    i(e, t), e.prototype = null === t ? Object.create(t) : (r.prototype = t.prototype, new r)
  });
  a = function() {
    return (a = Object.assign || function(e) {
      for (var t, r = 1, n = arguments.length; r < n; r++)
        for (var o in t = arguments[r]) Object.prototype.hasOwnProperty.call(t, o) && (e[o] = t[o]);
      return e
    }).apply(this, arguments)
  };
  var c, l, u = self;
  "undefined" != typeof regeneratorRuntime && regeneratorRuntime;
  let d = null;
  const h = async ({
      coreURL: e,
      wasmURL: t,
      workerURL: r
    }) => {
      const n = e || "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
        o = t || n.replace(/.js$/g, ".wasm"),
        i = r || n.replace(/.js$/g, ".worker.js");
      if (d) return Promise.resolve();
      try {
        importScripts(n)
      } catch {}
      return d = await createFFmpegCore({
        mainScriptUrlOrBlob: n + "#" + btoa(JSON.stringify({
          wasmURL: o,
          workerURL: i
        }))
      }), d.setLogger((e => u.postMessage({
        type: "LOG",
        data: e
      }))), d.setProgress((e => u.postMessage({
        type: "PROGRESS",
        data: e
      }))), Promise.resolve()
    },
    p = ({
      args: e,
      timeout: t
    }) => (d.setTimeout(void 0 === t ? -1 : t), d.exec(...e), d.ret),
    m = ({
      path: e,
      data: t
    }) => (d.FS.writeFile(e, t), !0),
    g = ({
      path: e,
      encoding: t
    }) => d.FS.readFile(e, {
      encoding: t
    }),
    f = ({
      path: e
    }) => (d.FS.unlink(e), !0),
    y = ({
      oldPath: e,
      newPath: t
    }) => (d.FS.rename(e, t), !0),
    v = ({
      path: e
    }) => (d.FS.mkdir(e), !0),
    _ = ({
      path: e
    }) => {
      const t = d.FS.readdir(e),
        r = [];
      for (const n of t) {
        const t = d.FS.stat(`${e}/${n}`);
        r.push({
          name: n,
          isDir: d.FS.isDir(t.mode)
        })
      }
      return r
    },
    E = ({
      path: e
    }) => (d.FS.rmdir(e), !0);
  return u.onmessage = (async ({
    data: {
      id: e,
      type: r,
      data: i
    }
  }) => {
    const a = [];
    try {
      if (r !== t.LOAD && !d) return void u.postMessage({
        id: e,
        type: t.ERROR,
        data: o.toString()
      });
      let s;
      switch (r) {
        case t.LOAD:
          s = await h(i);
          break;
        case t.EXEC:
          s = p(i);
          break;
        case t.WRITE_FILE:
          s = m(i);
          break;
        case t.READ_FILE:
          s = g(i);
          break;
        case t.DELETE_FILE:
          s = f(i);
          break;
        case t.RENAME:
          s = y(i);
          break;
        case t.CREATE_DIR:
          s = v(i);
          break;
        case t.LIST_DIR:
          s = _(i);
          break;
        case t.DELETE_DIR:
          s = E(i);
          break;
        default:
          return void u.postMessage({
            id: e,
            type: t.ERROR,
            data: n.toString()
          })
      }
      s instanceof Uint8Array && a.push(s.buffer), u.postMessage({
        id: e,
        type: r,
        data: s
      }, a)
    } catch (r) {
      u.postMessage({
        id: e,
        type: t.ERROR,
        data: r.toString()
      })
    }
  }), ffmpeg_ffmpeg_worker = {}
}
requireFfmpeg_ffmpeg_worker();
//# sourceMappingURL=worker.js.map
