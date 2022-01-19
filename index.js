const express = require('express');
const http = require('http');
const https = require('https');
const cors = require('cors');
const {app, BrowserWindow, ipcMain, Menu, Tray, dialog } = require('electron');
const path = require('path');
const { networkInterfaces } = require('os');
const fs = require('fs');
const JSZip = require('jszip')
const netplay = true

let window;
var servers = []
global.data = {}
global.users = {}
global.userData = {}
global.passwords = {}
global.isOwner = {}

app.on('second-instance', function(e, cmd, dir) {
    if ('undefined' != typeof window) {
        window.show();
    }
})

app.on('window-all-closed', function() {
    app.quit()
})

app.on('ready', function() {
    createWindow();
})

function getIPs() {
    let ifaces = networkInterfaces();
    var ips = [ ]
    for (var k in ifaces) {
        for (var i=0; i<ifaces[k].length; i++) {
            if (ifaces[k][i].family == 'IPv4') {
                ips.push(ifaces[k][i].address)
            }
        }
    }
    return ips
}

function createWindow() {
    window = new BrowserWindow({
        backgroundColor: '#ffffff',
        width: 1000,
        minWidth: 280,
        height: 700,
        minHeight: 200,
        frame: true,
        title: "emu stuff",
        webPreferences: {
            scrollBounce: false,
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: true,
            preload: path.join(__dirname, "preload.js")
        }
    });
    window.loadFile('index.html');
}

async function getEmuFiles() {
    var zip = await new Promise(function(resolve, reject) {
        var req = https.get('https://codeload.github.com/ethanaobrien/emulatorjs/zip/refs/heads/main', function (res) {
          if (res.statusCode !== 200) {
            console.log(res.statusCode);
            return;
          }
          var data = [], dataLen = 0;
          res.on("data", function (chunk) {
            data.push(chunk);
            dataLen += chunk.length;
          });
          res.on("end", function () {
            var buf = Buffer.concat(data);
            JSZip.loadAsync(buf).then(function(zip) {
              resolve(zip)
            })
          });
        });
        req.on("error", function(err){})
    })
    var folder = path.join(app.getPath('userData'), 'emuFiles');
    if (! fs.existsSync((folder))) {
        try {
            fs.mkdirSync(folder, {recursive: true});
        } catch(e) {}
    }
    for (var k in zip.files) {
        var file = k.split('/').pop();
        try {
            fs.rmSync(path.join(app.getPath('userData'), path.join('emuFiles', file)));
        } catch(e) {}
        try {
            fs.writeFileSync(path.join(app.getPath('userData'), path.join('emuFiles', file)), Buffer.from(await zip.files[k].async("uint8array")));
        } catch(e) {}
    }
}


var games = []
try {
    games = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'games.json'), 'utf8'))
    if (! Array.isArray(games)) {
        games = [];
    }
} catch(e) {
    games = [];
}

ipcMain.handle('message', function(e, msg) {
    if (msg.type === 'getIps') {
        return getIPs();
    } else if (msg.type === 'new game') {
        var fileName = msg.data.fileName
        var pathh = path.join(app.getPath('userData'), path.join('games', fileName))
        var folder = path.join(app.getPath('userData'), 'games')
        if (! fs.existsSync(folder)) {
            try {
                fs.mkdirSync(folder, {recursive: true})
            } catch(e) { }
        }
        fs.writeFileSync(pathh, Buffer.from(msg.data.gameData))
        var data = msg.data
        delete data.gameData
        data.id = games.length+1;
        games.push(data)
        fs.writeFileSync(path.join(app.getPath('userData'), 'games.json'), JSON.stringify(games))
    } else if (msg.type === 'get games') {
        return games;
    } else if (msg.type === 'refresh data directory') {
        getEmuFiles();
    }
})

var handler = express();
var server = http.createServer(handler);
handler.use(cors())

handler.use(function(req, res, next) {
    if (req.path.startsWith('/data/')) {
        res.sendFile(path.join(path.join(app.getPath('userData'), 'emuFiles'), req.path.split('?')[0].split('/').pop()))
    } else {
        next()
    }
})

handler.get('/', function(req, res) {
    var html = '<html><head><style>.button0{background-color:#ff8400;border:2px solid #ff8400;border-radius:12px;color:#fff;padding:8px 22px;text-align:center;text-decoration:none;display:inline-block;font-size:16px;transition-duration:.4s}.button0:hover{background-color:#fff;color:#000;box-shadow:0 12px 16px 0 rgba(0,0,0,0.24),0 17px 50px 0 rgba(0,0,0,0.19);cursor:pointer}.button1{background-color:#fff;border:2px solid #f44336;border-radius:12px;color:#000;padding:8px 22px;text-align:center;text-decoration:none;display:inline-block;font-size:16px;transition-duration:.4s}.button1:hover{background-color:#f44336;color:#fff;box-shadow:0 12px 16px 0 rgba(0,0,0,0.24),0 17px 50px 0 rgba(0,0,0,0.19);cursor:pointer}</style></head><body><ul><br><h1>GAMES</h1><br><ul>';
    var number = '0';
    for (var i=0; i<games.length; i++) {
        var name = (typeof games[i]['EJS_gameName'] === String) ? games[i]['EJS_gameName'] : games[i].fileName.split('.')[0];
        html += '<li><button id='+games[i].id+' onclick="window.location.href=\'/play?id=\'+this.id" class="button button'+number+'">'+name+'</button></li><br>';
        number = (number === '0') ? '1' : '0';
    }
    html += '</ul></ul></body></html>';
    res.end(html)
    
})

handler.get('/rom', function(req, res) {
    var args = transformArgs(req.url)
    if (! args.id || isNaN(args.id)) {
        res.setHeader('location', '/')
        res.setHeader('content-type', 'text/html; chartset=utf-8')
        res.writeHead(307)
        res.end('<a href="/">Go here</a>')
        return
    }
    var id = parseInt(args.id);
    var game;
    for (var i=0; i<games.length; i++) {
        if (games[i].id === id) {
            game = games[i];
            break;
        }
    }
    res.sendFile(path.join(path.join(app.getPath('userData'), 'games'), game.fileName))
})

handler.get('/play', function(req, res) {
    var args = transformArgs(req.url)
    if (! args.id || isNaN(args.id)) {
        res.setHeader('location', '/')
        res.setHeader('content-type', 'text/html; chartset=utf-8')
        res.writeHead(307)
        res.end('<a href="/">Go here</a>')
        return
    }
    var id = parseInt(args.id);
    var game;
    for (var i=0; i<games.length; i++) {
        if (games[i].id === id) {
            game = games[i];
            break;
        }
    }
    var html = '<a href="/">To Home</a><br><br><div style="width:640px;height:480px;max-width:100%"><div id="game"></div><div id="game"></div><script type="text/javascript">EJS_player = "#game";EJS_gameUrl = "/rom?id='+args.id+'";EJS_pathtodata = "/data/";';
    for (var k in game) {
        if (k.startsWith('EJS_')) {
            if (game[k] === true || game[k] === false) {
                html += k + ' = ' + game[k] + ';';
            } else {
                html += k + ' = "' + game[k] + '";';
            }
        }
    }
    if (netplay) {
        html += 'EJS_gameID = '+args.id+';';
        html += 'EJS_netplayUrl = "http://"+window.location.hostname+":3000/";';
    }
    html += '</script><script src="/data/loader.js"></script>'
    res.end(html)
})


var port = 8082;
server.listen(port || 8082, () => {
    console.log('listening on *:'+(port || 8082));
});

function defineArrayPaths(data, args) {
    if (! global.data[data.extra.domain]) {
        global.data[data.extra.domain] = {}
    }
    if (! global.data[data.extra.domain][data.extra.game_id]) {
        global.data[data.extra.domain][data.extra.game_id] = {}
    }
    if (! global.users[data.extra.domain]) {
        global.users[data.extra.domain] = {}
    }
    if (! global.users[data.extra.domain][data.extra.game_id]) {
        global.users[data.extra.domain][data.extra.game_id] = {}
    }
    if (! global.users[data.extra.domain][data.extra.game_id][args.sessionid]) {
        global.users[data.extra.domain][data.extra.game_id][args.sessionid] = []
    }
    if (! global.isOwner[data.extra.domain]) {
        global.isOwner[data.extra.domain] = {}
    }
    if (! global.isOwner[data.extra.domain][data.extra.game_id]) {
        global.isOwner[data.extra.domain][data.extra.game_id] = {}
    }
    if (! global.isOwner[data.extra.domain][data.extra.game_id][args.sessionid]) {
        global.isOwner[data.extra.domain][data.extra.game_id][args.sessionid] = {}
    }
    if (! global.userData[data.extra.domain]) {
        global.userData[data.extra.domain] = {}
    }
    if (! global.userData[data.extra.domain][data.extra.game_id]) {
        global.userData[data.extra.domain][data.extra.game_id] = {}
    }
    if (! global.userData[data.extra.domain][data.extra.game_id][args.sessionid]) {
        global.userData[data.extra.domain][data.extra.game_id][args.sessionid] = {}
    }
    if (! global.passwords[data.extra.domain]) {
        global.passwords[data.extra.domain] = {}
    }
    if (! global.passwords[data.extra.domain][data.extra.game_id]) {
        global.passwords[data.extra.domain][data.extra.game_id] = {}
    }
}

function terminateServers() {
    global.data = {}
    global.users = {}
    global.userData = {}
    global.passwords = {}
    global.isOwner = {}
    for (var i=0; i<servers.length; i++) {
        servers[i].destroy()
    }
    servers = []
}

function makeServer(port) {
    const app = express();
    const server = http.createServer(app);
    const io = require("socket.io")(server);
    app.use(cors())
    app.get('/list', function(req, res) {
        var args = transformArgs(req.url)
        if (! args.game_id || ! args.domain) {
            res.end('{}')
            return
        }
        if (! global.data[args.domain]) {
            global.data[args.domain] = {}
        }
        if (! global.data[args.domain][args.game_id]) {
            global.data[args.domain][args.game_id] = {}
        }
        res.end(JSON.stringify(global.data[args.domain][args.game_id]))
    })
    io.on('connection', (socket) => {
        var url = socket.handshake.url
        var args = transformArgs(url)
        var room = ''
        var extraData = JSON.parse(args.extra)
        function disconnect() {
            io.to(room).emit('user-disconnected', args.userid)
            var newArray = []
            for (var i=0; i<global.users[extraData.domain][extraData.game_id][args.sessionid].length; i++) {
                if (global.users[extraData.domain][extraData.game_id][args.sessionid][i] !== args.userid) {
                    newArray.push(global.users[extraData.domain][extraData.game_id][args.sessionid][i])
                }
            }
            delete global.userData[extraData.domain][extraData.game_id][args.sessionid][args.userid]
            if (global.isOwner[extraData.domain][extraData.game_id][args.sessionid][args.userid]) {
                for (var k in global.userData[extraData.domain][extraData.game_id][args.sessionid]) {
                    if (k !== args.userid) {
                        global.isOwner[extraData.domain][extraData.game_id][args.sessionid][k] = true;
                        global.userData[extraData.domain][extraData.game_id][args.sessionid][k].socket.emit('set-isInitiator-true', args.sessionid)
                    }
                    break;
                }
            }
            global.users[extraData.domain][extraData.game_id][args.sessionid] = newArray
            global.data[extraData.domain][extraData.game_id][args.sessionid].current = global.users[extraData.domain][extraData.game_id][args.sessionid].length
            global.isOwner[extraData.domain][extraData.game_id][args.sessionid][args.userid] = false;
            if (global.data[extraData.domain][extraData.game_id][args.sessionid].current === 0) {
                delete global.data[extraData.domain][extraData.game_id][args.sessionid];
                delete global.passwords[extraData.domain][extraData.game_id][args.sessionid];
                delete global.userData[extraData.domain][extraData.game_id][args.sessionid];
                delete global.users[extraData.domain][extraData.game_id][args.sessionid];
                delete global.isOwner[extraData.domain][extraData.game_id][args.sessionid]
            }
            socket.leave(room)
            room = ''
        }
        socket.on('disconnect', () => {
            disconnect()
        });
        socket.on('close-entire-session', function(cb) {
            io.to(room).emit('closed-entire-session', args.sessionid, extraData)
            if (typeof cb == 'function') {
                cb(true)
            }
        })
        socket.on('open-room', function(data, cb) {
            defineArrayPaths(data, args)
            global.data[data.extra.domain][data.extra.game_id][args.sessionid] = {
                owner_name: data.extra.name,
                room_name: data.extra.room_name,
                country: 'US',
                max: parseInt(args.maxParticipantsAllowed) || 2,
                current: 1,
                password: (data.password === '' ? 0 : 1)
            }
            global.passwords[data.extra.domain][data.extra.game_id][args.sessionid] = (data.password === '' ? null : data.password);
            socket.emit('extra-data-updated', null, global.data[data.extra.domain][data.extra.game_id][args.sessionid])
            
            socket.emit('extra-data-updated', args.userid, global.data[data.extra.domain][data.extra.game_id][args.sessionid])
            
            global.userData[data.extra.domain][data.extra.game_id][args.sessionid][args.userid] = {
                "socket": socket,
                "extra": data.extra
            }
            global.users[data.extra.domain][data.extra.game_id][args.sessionid].push(args.userid)
            room = data.extra.domain+':'+data.extra.game_id+':'+args.sessionid
            socket.join(room)
            global.isOwner[data.extra.domain][data.extra.game_id][args.sessionid][args.userid] = true;
            cb(true, undefined)
        })
        socket.on('check-presence', function(roomid, cb) {
            if (global.data[data.extra.domain][data.extra.game_id][roomid]) {
                cb(true, roomid, null)
                return
            }
            cb(false, roomid, null)
            return
        })
        socket.on('join-room', function(data, cb) {
            defineArrayPaths(data, args)
            if (global.passwords[data.extra.domain][data.extra.game_id][args.sessionid]) {
                var password = global.passwords[data.extra.domain][data.extra.game_id][args.sessionid]
                if (password !== data.password) {
                    cb(false, 'INVALID_PASSWORD')
                    return
                }
            }
            if (! global.users[data.extra.domain][data.extra.game_id][args.sessionid]) {
                cb(false, 'USERID_NOT_AVAILABLE')
                return
            }
            if (global.data[data.extra.domain][data.extra.game_id][args.sessionid].current >= global.data[data.extra.domain][data.extra.game_id][args.sessionid].max) {
                cb(false, 'ROOM_FULL')
                return
            }
            room = data.extra.domain+':'+data.extra.game_id+':'+data.sessionid
            
            for (var i=0; i<global.users[data.extra.domain][data.extra.game_id][args.sessionid].length; i++) {
                socket.to(room).emit('netplay', {
                    "remoteUserId": global.users[data.extra.domain][data.extra.game_id][args.sessionid][i],
                    "message": {
                        "newParticipationRequest": true,
                        "isOneWay": false,
                        "isDataOnly": true,
                        "localPeerSdpConstraints": {
                            "OfferToReceiveAudio": false,
                            "OfferToReceiveVideo": false
                        },
                        "remotePeerSdpConstraints": {
                            "OfferToReceiveAudio": false,
                            "OfferToReceiveVideo": false
                        }
                    },
                    "sender": args.userid,
                    "extra": extraData
                })
            }
            
            global.userData[data.extra.domain][data.extra.game_id][args.sessionid][args.userid] = {
                "socket": socket,
                "extra": data.extra
            }
            global.data[data.extra.domain][data.extra.game_id][data.sessionid].current++
            
            socket.to(room).emit('user-connected', args.userid)
            socket.join(room)
            
            for (var i=0; i<global.users[data.extra.domain][data.extra.game_id][args.sessionid].length; i++) {
                socket.emit('user-connected', global.users[data.extra.domain][data.extra.game_id][args.sessionid][i])
            }
            global.users[data.extra.domain][data.extra.game_id][args.sessionid].push(args.userid)
            global.isOwner[data.extra.domain][data.extra.game_id][args.sessionid][args.userid] = false;
            cb(true, null)
        })
        socket.on('set-password', function(password, cb) {
            if (password && password !== '') {
                global.passwords[data.extra.domain][data.extra.game_id][args.sessionid] = password;
                global.data[data.extra.domain][data.extra.game_id][args.sessionid].password = 1;
            }
            if (typeof cb == 'function') {
                cb(true)
            }
        });
        socket.on('changed-uuid', function(newUid, cb) {
            var a = global.users[extraData.domain][extraData.game_id][args.sessionid]
            if (a.includes(args.userid)) {
                for (var i=0; i<a.length; i++) {
                    if (global.users[extraData.domain][extraData.game_id][args.sessionid][i] === args.userid) {
                        global.users[extraData.domain][extraData.game_id][args.sessionid][i] = newUid
                        break;
                    }
                }
            }
            args.userid = newUid
        });
        socket.on('disconnect-with', function(userid, cb) {
            for (var k in global.userData[extraData.domain][extraData.game_id][args.sessionid]) {
                if (k === userid) {
                    global.userData[extraData.domain][extraData.game_id][args.sessionid][k].socket.emit('closed-entire-session', args.sessionid, extraData)
                    disconnect()
                }
            }
            if (typeof cb == 'function') {
                cb(true)
            }
        })
        socket.on('netplay', function(msg) {
            if (msg && msg.message && msg.message.userLeft === true) {
                disconnect()
            }
            var outMsg = JSON.parse(JSON.stringify(msg))
            outMsg.extra = extraData
            socket.to(room).emit('netplay', outMsg)
        })
        socket.on('extra-data-updated', function(msg) {
            var outMsg = JSON.parse(JSON.stringify(msg))
            outMsg.country = 'US'
            extraData = outMsg
            if (global.userData[extraData.domain] && global.userData[extraData.domain][extraData.game_id] && global.userData[extraData.domain][extraData.game_id][args.sessionid] && global.userData[extraData.domain][extraData.game_id][args.sessionid][args.userid]) {
                global.userData[extraData.domain][extraData.game_id][args.sessionid][args.userid].extra = extraData
            } else if (args.userid) {
                if (! global.userData[extraData.domain]) {
                    global.userData[extraData.domain] = {}
                }
                if (! global.userData[extraData.domain][extraData.game_id]) {
                    global.userData[extraData.domain][extraData.game_id] = {}
                }
                if (! global.userData[extraData.domain][extraData.game_id][args.sessionid]) {
                    global.userData[extraData.domain][extraData.game_id][args.sessionid] = {}
                }
                global.userData[extraData.domain][extraData.game_id][args.sessionid][args.userid] = {
                    "socket": socket,
                    "extra": extraData
                }
            }
            
            io.to(room).emit('extra-data-updated', args.userid, outMsg)
        })
        socket.on('get-remote-user-extra-data', function(id) {
            socket.emit('extra-data-updated', global.userData[extraData.domain][extraData.game_id][args.sessionid][id].extra)
        })
    });
    server.listen(port || 3000, () => {
        console.log('listening on *:'+(port || 3000));
    });
    var connections = {}
    server.on('connection', function(e) {
        var k = e.remoteAddress + ':' + e.remotePort;
        connections[k] = e;
        e.on('close', function() {
            delete connections[k];
        });
    });
    server.destroy = function(cb) {
        server.close(cb);
        for (var k in connections) {
            connections[k].destroy();
        }
    };
    servers.push(server)
}

function transformArgs(url) {
    var args = {}
    var idx = url.indexOf('?')
    if (idx != -1) {
        var s = url.slice(idx+1)
        var parts = s.split('&')
        for (var i=0; i<parts.length; i++) {
            var p = parts[i]
            var idx2 = p.indexOf('=')
            args[decodeURIComponent(p.slice(0,idx2))] = decodeURIComponent(p.slice(idx2+1,s.length))
        }
    }
    return args
}

makeServer()
