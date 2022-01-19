const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {
    openExternal: function(url) {
        shell.openExternal(url);
    },
    sendMsg: function(e) {
        return ipcRenderer.invoke("message", e)
    }
})

