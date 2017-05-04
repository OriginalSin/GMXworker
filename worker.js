var defaults = {
	serverHost: 'maps.kosmosnimki.ru',
	protocol: location.protocol,
	apiKey: ''
};


self.onmessage = function(e) {
	var mess = e.data;
	// console.log('worker', location.protocol, self.Promise, self.fetch, mess);
	if (mess && mess.id) {
		var cmd = mess.cmd || '',
			id = mess.id;
		mapUtils._waitCmdHash[id] = {
			inp: mess
		};
		if (cmd === 'getMapProperties') {
			mapUtils.loadMapProperties(mess).then(function(mapTree) {
				// mess.promiseArr = [];
				// var promise = mapUtils.iterateMapTree(mapTree, mess);
				// mess.promiseArr.push(promise);
				Promise.all(mapUtils.iterateMapTree(mapTree, mess)).then(function() {
					self.postMessage({ cmd: cmd, id: id, res: {mapTree: mapTree, visible: mapUtils._waitCmdHash[id].visible} });
console.log('Promise.all', id, mapUtils._waitCmdHash[id], mess.promiseArr);
					delete mapUtils._waitCmdHash[id];
				});
	// console.log('loadMapProperties', mapTree);
			});
		} else if (cmd === 'getSessionKey') {
			mapUtils.requestSessionKey(mess).then(function(sKey) {
				self.postMessage({ cmd: cmd, id: id, res: sKey });
				// delete mapUtils._waitCmdHash[id];
			});
		}
	}
};

// var ab = new ArrayBuffer(100);
// self.postMessage({ data: ab }, [ab]);

var mapUtils = {
	_promises: {
		_sessionKeys: {},
		_maps: {}
	},
	_dataManagers: {},
	_waitCmdHash: {},

    getTileAttributes: function(prop) {
        var tileAttributeIndexes = {},
            tileAttributeTypes = {};
        if (prop.attributes) {
            var attrs = prop.attributes,
                attrTypes = prop.attrTypes || null;
            if (prop.identityField) { tileAttributeIndexes[prop.identityField] = 0; }
            for (var a = 0; a < attrs.length; a++) {
                var key = attrs[a];
                tileAttributeIndexes[key] = a + 1;
                tileAttributeTypes[key] = attrTypes ? attrTypes[a] : 'string';
            }
        }
        return {
            tileAttributeTypes: tileAttributeTypes,
            tileAttributeIndexes: tileAttributeIndexes
        };
    },

	extend: function (dest) { // (Object[, Object, ...]) ->
		var sources = Array.prototype.slice.call(arguments, 1),
		    i, j, len, src;

		for (j = 0, len = sources.length; j < len; j++) {
			src = sources[j] || {};
			for (i in src) {
				if (src.hasOwnProperty(i)) {
					dest[i] = src[i];
				}
			}
		}
		return dest;
	},

	setOptions: function (obj, options) {
		obj.options = mapUtils.extend({}, obj.options, options);
		return obj.options;
	},

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
        var keys = mapUtils._promises._sessionKeys,
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
		var maps = mapUtils._promises._maps,
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

	iterateMapTree: function(mapTree, options) {	// итерация по большому дереву
		var maps = mapUtils._promises._maps,
			serverHost = options.hostName || options.serverHost || defaults.serverHost,
			serverHostPromises = maps[serverHost] || {};
			flag = false,
			promiseArr = [];

		mapUtils.iterateNode(mapTree, function(node) {
			var props = node.content.properties;
if (props.GroupID === 'BvuGm52gvxHt9RZp') {	// отладка
props.dataSource = 'T4CUM';
}
			var dataSource = props.dataSource || '';
			node.gmxOptions = {
				dataSource: dataSource,
				mapID: options.mapID
			};
			node.id = props.name || props.GroupID;
			node.text = props.title;
			node.children = node.content.children;
			if (node.type === 'group' && dataSource) {
				if (props.expanded || props.visible) {
					node.gmxOptions.dataSourceType = 'map';
					if (!serverHostPromises[dataSource]) {
						flag = true;
						promiseArr.push(new Promise(function(resolve) {
							var options1 = {mapID: dataSource, id: options.id};
							mapUtils.loadMapProperties(options1).then(function(subMapTree) {
								node.children = subMapTree.children;
								var promiseArr1 = mapUtils.iterateMapTree(subMapTree, options1);
								Promise.all(promiseArr1).then(resolve);
							});
						}));
					} else {
						serverHostPromises[dataSource].promise.then(function(subMapTree) {
							node.children = subMapTree.children;
						});
					} 

				} else {
					node.children = true;
				}
			} else if (node.type === 'layer' && props.visible) {
				mapUtils.createDataManager(node);
				if (!mapUtils._waitCmdHash[options.id].visible) { mapUtils._waitCmdHash[options.id].visible = []; }
				mapUtils._waitCmdHash[options.id].visible.push(node);
			}
		});
		return promiseArr;
    },

	createDataManager: function(node, clearVersion) {
		mapUtils._dataManagers[node.id] = new mapUtils.DataManager(node.content.properties, clearVersion);
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
		// load: this._vectorTileDataProviderLoad.bind(this)
	};

	// this._observerTileLoader = new ObserverTileLoader(this);
	// this._observerTileLoader.on('tileload', function(event) {
		// var tile = event.tile;
		// _this._updateItemsFromTile(tile);

		// if (_this._tilesTree) {
			// var treeNode = _this._tilesTree.getNode(tile.d, tile.s);
			// treeNode && treeNode.count--; //decrease number of tiles to load inside this node
		// }
	// });

	// this._observerTileLoader.on('observertileload', function(event) {
		// var observer = event.observer;
		// if (observer.isActive()) {
			// observer.needRefresh = false;
			// observer.updateData(_this.getItems(observer.id));
		// }
	// });
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
	// return this;
};

mapUtils.DataManager.prototype = {
    options: {
        name: null,                         // layer ID
		srs: '',							// geometry projection (3395 or 3857)
        identityField: '',                  // attribute name for identity items
        attributes: [],                     // attributes names
        attrTypes: [],                      // attributes types
        tiles: null,                        // tiles array for nontemporal data
        tilesVers: null,                    // tiles version array for nontemporal data
        LayerVersion: -1,                   // layer version
        GeoProcessing: null,                // processing data
        Temporal: false,                    // only for temporal data
        TemporalColumnName: '',             // temporal attribute name
        ZeroDate: '01.01.2008',             // 0 date string
        TemporalPeriods: [],                // temporal periods
        TemporalTiles: [],                  // temporal tiles array
        TemporalVers: [],                   // temporal version array
        hostName: 'maps.kosmosnimki.ru',    // default hostName
        sessionKey: '',                     // session key
        isGeneralized: false,               // flag for use generalized tiles
        isFlatten: false                    // flag for flatten geometry
    },

    setOptions: function(options) {
        // this._clearProcessing();
        // if (options.GeoProcessing) {
            // this.processingTile = this.addData([]);
            // this._chkProcessing(options.GeoProcessing);
        // }
        mapUtils.setOptions(this, options);
        this.optionsLink = options;
        this._isTemporalLayer = this.options.Temporal;

        var tileAttributes = mapUtils.getTileAttributes(this.options);
        this.tileAttributeIndexes = tileAttributes.tileAttributeIndexes;
        this.temporalColumnType = tileAttributes.tileAttributeTypes[this.options.TemporalColumnName];

        var hostName = this.options.hostName,
            sessionKey = this.options.sessionKey;

        // if (!sessionKey) {
            // sessionKey = L.gmx.gmxSessionManager.getSessionKey(hostName);
        // }
        // this.tileSenderPrefix = protocol + '//' + hostName + '/' +
            // 'TileSender.ashx?WrapStyle=None' +
            // '&key=' + encodeURIComponent(sessionKey);

        this._needCheckActiveTiles = true;
    },
    addLayerFilter: function(filterFunc, options) {
        if (options && options.layerID) {
			var	layerID = options.layerID,
				name = options.target || 'screen';

			if (!this._filtersView[layerID]) { this._filtersView[layerID] = {}; }
			if (options.id) { name += '_' + options.id; }

			this._filtersView[layerID][name] = filterFunc;
			// this._triggerObservers(this._getObserversByFilterName(name, options.target));
		}
		return this;
    },

    removeLayerFilter: function(options) {
        if (this._filtersView[options.layerID]) {
			var	layerID = options.layerID,
				name = options.target || 'screen';
			if (options.id) { name += '_' + options.id; }

            if (this._filtersView[layerID][name]) {
				var oKeys = this._getObserversByFilterName(name);
				delete this._filtersView[layerID][name];
				// this._triggerObservers(oKeys);
			}
        }
		return this;
    },

    addFilter: function(filterName, filterFunc) {
        this._filters[filterName] = filterFunc;
        // this._triggerObservers(this._getObserversByFilterName(filterName));
		return this;
    },

    removeFilter: function(filterName) {
        if (this._filters[filterName]) {
            var oKeys = this._getObserversByFilterName(filterName);
            delete this._filters[filterName];
            // this._triggerObservers(oKeys);
        }
		return this;
    }
};
// var DataManager = L.Class.extend({});
var tt = 1;
