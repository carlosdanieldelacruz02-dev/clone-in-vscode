// Dev-only stand-in for the WebExtension `chrome` APIs this extension uses.
//
// The preview is an ordinary web page: it cannot load an unpacked extension, and
// a plain page has no chrome.storage / chrome.action / chrome.tabs. This shim
// provides just those pieces (storage backed by localStorage) so the extension's
// real options.js and background.js run unmodified. It is injected into the
// extension's own HTML pages by devpreview/server.mjs and loaded directly by
// devpreview/index.html. Nothing here ships with the extension.

(function () {
  if (window.__devpreviewShim) return;

  var STORAGE_KEY = "devpreview.chromeStorage.sync";

  function readAll() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (error) {
      return {};
    }
  }

  function writeAll(values) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  }

  var shim = {
    // Page the "toolbar click" is simulated on, and the last deep link the
    // background script tried to open (recorded instead of navigated to, so the
    // preview page survives and you can read exactly what would have opened).
    currentTabUrl: "https://github.com/infinitepower18/CloneInVSCode",
    lastOpened: null,
    clickHandlers: [],
    startupHandlers: [],
    installedHandlers: [],
  };

  function listeners(target) {
    return {
      addListener: function (fn) {
        target.push(fn);
      },
      removeListener: function (fn) {
        var index = target.indexOf(fn);
        if (index !== -1) target.splice(index, 1);
      },
      hasListener: function (fn) {
        return target.indexOf(fn) !== -1;
      },
    };
  }

  var storage = {
    sync: {
      get: function (defaults, callback) {
        var stored = readAll();
        var result;
        if (typeof defaults === "string") {
          result = {};
          result[defaults] = stored[defaults];
        } else if (Array.isArray(defaults)) {
          result = {};
          defaults.forEach(function (key) {
            result[key] = stored[key];
          });
        } else {
          result = Object.assign({}, defaults || {}, stored);
        }
        if (callback) {
          callback(result);
          return undefined;
        }
        return Promise.resolve(result);
      },
      set: function (values, callback) {
        writeAll(Object.assign({}, readAll(), values));
        if (callback) {
          callback();
          return undefined;
        }
        return Promise.resolve();
      },
    },
  };

  var tabs = {
    query: function (query, callback) {
      var tab = { id: 1, active: true, windowId: 1, url: shim.currentTabUrl };
      if (callback) {
        callback([tab]);
        return undefined;
      }
      return Promise.resolve([tab]);
    },
    update: function (target, callback) {
      var url = typeof target === "string" ? target : target && target.url;
      if (url) shim.lastOpened = url;
      if (callback) callback({ id: 1, url: url });
      return Promise.resolve({ id: 1, url: url });
    },
    onUpdated: listeners([]),
    onCreated: listeners([]),
  };

  var action = {
    disable: function () {},
    enable: function () {},
    setIcon: function () {},
    onClicked: listeners(shim.clickHandlers),
  };

  var runtime = {
    onStartup: listeners(shim.startupHandlers),
    onInstalled: listeners(shim.installedHandlers),
    onMessage: listeners([]),
    lastError: undefined,
    getURL: function (resourcePath) {
      return "/" + String(resourcePath || "").replace(/^\//, "");
    },
  };

  // background.js touches these only when a startup/install event fires.
  var declarativeContent = {
    onPageChanged: {
      addRules: function () {},
      removeRules: function (rules, callback) {
        if (callback) callback();
      },
    },
    PageStateMatcher: function (conditions) {
      this.conditions = conditions;
    },
    ShowAction: function () {},
  };

  window.chrome = Object.assign({}, window.chrome, {
    storage: storage,
    tabs: tabs,
    action: action,
    runtime: runtime,
    declarativeContent: declarativeContent,
  });

  window.__devpreviewShim = shim;
})();
