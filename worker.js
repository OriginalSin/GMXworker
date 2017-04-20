var defaults = {
	serverHost: 'maps.kosmosnimki.ru',
	protocol: location.protocol,
	apiKey: ''
};


self.onmessage = function(e) {
	var mess = e.data,
		cmd = mess ? mess.cmd : '';
	// console.log('worker', location.protocol, self.Promise, self.fetch, mess);
	if (cmd === 'getMapProperties') {
		mapUtils.loadMapProperties(mess).then(function(mapTree) {
			mapUtils.iterateMapTree(mapTree, mess);
			self.postMessage({ cmd: cmd, id: mess.id, res: mapTree });
// console.log('loadMapProperties', mapTree);
		});
	} else if (cmd === 'getSessionKey') {
		mapUtils.requestSessionKey(mess).then(function(sKey) {
			self.postMessage({ cmd: cmd, id: mess.id, res: sKey });
		});
	}
	
};

// var ab = new ArrayBuffer(100);
// self.postMessage({ data: ab }, [ab]);

var mapUtils = {
	_sessionKeys: {},
	_maps: {},
	_dataManagers: {},
    iterateNode: function(treeInfo, callback) {
        var iterate = function(node) {
			var arr = node.children,
				flag = false;
            for (var i = 0, len = arr.length; i < len; i++) {
                var layer = arr[i];

				callback(layer);
                if (layer.type === 'group') {
                    flag = iterate(layer.content);
                }
            }
			return flag;
        };

        treeInfo && iterate(treeInfo);
    },
    requestSessionKey: function(options) {
        var keys = mapUtils._sessionKeys,
			serverHost = options.serverHost || defaults.serverHost;

        if (!(serverHost in keys)) {
            var apiKey = options.apiKey || defaults.apiKey;
            keys[serverHost] = new Promise(function(resolve, reject) {
				if (apiKey) {
					var url = defaults.protocol + '//' + serverHost + '/ApiKey.ashx?WrapStyle=None&Key=' + apiKey;
					mapUtils.requestJSON(url).then(function(response) {
						return response.json();
					}).then(function(json) {
						if (json && json.Status === 'ok') {
							resolve(json.Result.Key);
						} else {
							reject();
						}
					});
				} else {
					resolve('');
				}
			});
        }
        return keys[serverHost];
    },

    // parseResponse: function(response) {
		// var contentType = response.headers.get('content-type');
		// if(contentType && contentType.indexOf('application/json') !== -1) {
			// return response.json();
		// } else {
			// return '';
			// console.log('Oops, we haven`t got JSON from `' + url + '`!');
		// }
    // },

    requestJSON: function(url, data, options) {
		if (url) {
			options = options || {};
			if (data) {
				if (options.method === 'POST') {
					var formData  = new FormData();
					for(var name in data) { formData.append(name, data[name]); }
					options.body = formData;
				} else {
					url += (url.indexOf('?') === -1 ? '?' : '&') + Object.keys(data).reduce(function(p, k) {
						if (data[k]) { p.push(k + '=' + data[k]); }
						return p;
					}, []).join('&');
				}
			}

			return fetch(url, options);
		} else {
			console.log('requestJSON: bar URI `' + url + '`!');
		}
    },

	loadMapProperties: function(options) {
		var maps = mapUtils._maps,
			serverHost = options.hostName || options.serverHost || defaults.serverHost,
			mapName = options.mapID;

        if (!maps[serverHost] || !maps[serverHost][mapName]) {
			var opt = {
				WrapStyle: 'None',
				skipTiles: options.skipTiles || 'None', // All, NotVisible, None
				MapName: mapName,
				srs: options.srs || '',	// 3857
				ModeKey: 'map'
			};
            maps[serverHost] = maps[serverHost] || {};
            maps[serverHost][mapName] = {
				promise: new Promise(function(resolve, reject) {
					mapUtils.requestSessionKey({serverHost: serverHost, apiKey: options.apiKey}).then(function(sessionKey) {
						opt.key = sessionKey;
						mapUtils.requestJSON(defaults.protocol + '//' + serverHost + '/TileSender.ashx', opt).then(function(response) {
							return response.json();
						}).then(function(json) {
							if (json && json.Status === 'ok' && json.Result) {
								json.Result.properties.hostName = serverHost;
								resolve(json.Result);
							} else {
								reject(json);
							}
						});
					});
				})
			};
        }
        return maps[serverHost][mapName].promise;
    },

	iterateMapTree: function(mapTree, options) {
		var maps = mapUtils._maps,
			serverHost = options.hostName || options.serverHost || defaults.serverHost,
			flag = false;
		mapUtils.iterateNode(mapTree, function(node) {
			var props = node.content.properties;
if (props.GroupID === 'BvuGm52gvxHt9RZp') {
	props.dataSource = 'T4CUM';
}
			node.gmxOptions = {
				dataSource: props.dataSource || '',
				mapID: options.mapID
			};
			node.id = props.name || props.GroupID;
			node.text = props.title;
			node.children = node.content.children;
			if (node.type === 'group' && node.gmxOptions.dataSource) {
				if (props.expanded || props.visible) {
console.log('aaaaaaaa', node.gmxOptions);
					if (!maps[serverHost] || !maps[serverHost][node.gmxOptions.dataSource]) {
						flag = true;
						var mess1 = {mapID: node.gmxOptions.dataSource};
						mapUtils.loadMapProperties(mess1).then(function(subMapTree) {
							flag = mapUtils.iterateMapTree(subMapTree, mess1);
				// console.log('loadMapProperties', mapTree);
						});
					}
				} else {
					node.children = true;
					// [
						// {text: 'Extrnal map', mapID: node.gmxOptions.dataSource}
					// ];
				}
				// iterate(layer.content);
			// } else if (layer.type === 'layer') {
			}
		});
console.log('iterateMapTree', flag);
		return flag;
    }
};

mapUtils.DataManager = function(options, clearVersion) {
	this._tilesTree = null;
	this._activeTileKeys = {};
	this._endDate = null;
	this._beginDate = null;

	this._tiles = {};
	this._filters = {};
	this._filtersView = {};
	this._freeSubscrID = 0;
	this._items = {};
	this._observers = {};

	this._needCheckDateInterval = false;
	this._needCheckActiveTiles = true;

	var _this = this;
	this._vectorTileDataProvider = {
		load: this._vectorTileDataProviderLoad.bind(this)
	};

	this._observerTileLoader = new ObserverTileLoader(this);
	this._observerTileLoader.on('tileload', function(event) {
		var tile = event.tile;
		_this._updateItemsFromTile(tile);

		if (_this._tilesTree) {
			var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
			treeNode && treeNode.count--; //decrease number of tiles to load inside this node
		}
	});

	this._observerTileLoader.on('observertileload', function(event) {
		var observer = event.observer;
		if (observer.isActive()) {
			observer.needRefresh = false;
			observer.updateData(_this.getItems(observer.id));
		}
	});
	this.setOptions(options);
	if (clearVersion) {
		this.options.LayerVersion = -1;
	}
	if (this._isTemporalLayer) {
		this.addFilter('TemporalFilter', function(item, tile, observer) {
			var unixTimeStamp = item.options.unixTimeStamp,
				dates = observer.dateInterval;
			return dates && unixTimeStamp >= dates.beginDate.valueOf() && unixTimeStamp < dates.endDate.valueOf();
		});
	}
};
mapUtils.DataManager.prototype = {
    extend: function(x, y) {
        if (x < this.min.x) { this.min.x = x; }
        if (x > this.max.x) { this.max.x = x; }
        if (y < this.min.y) { this.min.y = y; }
        if (y > this.max.y) { this.max.y = y; }
        return this;
    },
};
// var DataManager = L.Class.extend({});
var tt = 1;
