var map = L.map('map', {
	skipTiles: 'All',
	srs: '3857'
}).setView([55.73, 37.59], 5);

var osm = L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	maxZoom: 17,
	attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'
}).addTo(map);

var prev = document.getElementsByClassName('prev');

var mapLayers = {
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
    getGmxMap: function(mapTree) {
		var gmxMap = {
			rawTree: mapTree,
			layers: mapTree.properties
		};
		mapUtils.iterateNode(mapTree, function(node) {
			var props = node.content.properties;
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
	},
	addLayers: function(arr) {
		arr.forEach(function(it) {
		});
	}
};

// var worker = new Worker('worker.js');

L.gmx._workerData = {
	_waitCmdHash: {},
    worker: new Worker('worker.js'),
    lastID: 0,
	onmessage: function(e) {
		var mess = e.data;
		mapLayers.addLayers(mess.res.visible);
		console.log('onmessage:', mess, e);
	},
	sendMessage: function(opt) {
		opt.id = ++this.lastID;
console.log('sendMessage:', opt);
		if (!this.worker.onmessage) {
			this.worker.onmessage = this.onmessage;
		}
		this.worker.postMessage(opt);
		this._waitCmdHash[this.lastID] = opt;
		return this.lastID;
	}
};
 
// L.gmx._workerData.onmessage = function(e) {
	// var mess = e.data;
	// console.log('onmessage:', mess, e);
// };
prev[0].onclick = function(ev) {
	L.gmx._workerData.sendMessage({
		cmd: 'getMapProperties',
		skipTiles: map.options.skipTiles,
		srs: map.options.srs,
		apiKey: 'Z2SSNR87N4',
		mapID: '24A629C7563742B49BBCC01D7D27B8DB'
	});
};

var testLayer = new L.gmx.VectorLayer({
	attribution: 'Test L.GridLayer'
}).addTo(map);


// var cmdID = sendMessage({
	// apiKey: 'Z2SSNR87N4',
	// cmd: 'getSessionKey'
// });
// sendMessage({
	// cmd: 'getMapProperties',
	// apiKey: 'Z2SSNR87N4',
	// mapID: '946GH'
// });

// sendMessage({
	// cmd: 'getMapProperties',
	// apiKey: 'Z2SSNR87N4',
	// mapID: '24A629C7563742B49BBCC01D7D27B8DB'
// });

//Load all the layers from GeoMixer map and add them to Leaflet map
//L.gmx.loadMap('24A629C7563742B49BBCC01D7D27B8DB', {leafletMap: map});
/*
var myGmxTree = L.control.gmxTree({
	position: 'mapTree',
	mapID: 'WX3Q3'
	// mapID: '24A629C7563742B49BBCC01D7D27B8DB'
});
myGmxTree
	.addTo(map)
	.on('selected', myGmxTree.nodeSelect)			// async: показать слой на карте (создать слой если еще не создан)
	.on('deselected', myGmxTree.nodeDeselect)		// скрыть слой с карты
	.on('expanded', function (ev) {					// async: открыть группу
		console.log('__expanded___', ev);
	})
	.on('contextmenu', function (ev) {				// контекстное меню
		console.log('_____', ev);
		var node = ev.treeNode,
			// originalEvent = node.originalEvent,
			// gmxOptions = node.gmxOptions,
			type = node.type,
			arr = [];
		if (type === 'layer') {
			// if (dataSource) // меню вьюшки
			arr = [	// меню источника данных слоя 
				{text: 'Свойства', callback: function (ev) { console.log('Свойства', ev); }},
				{separator: true},
				{text: 'Копировать стиль', callback: function (ev) { console.log('Копировать стиль', ev); }},
				{text: 'Добавить объект', callback: function (ev) { console.log('Добавить объект', ev); }}
			];
		} else if (type === 'group') {
			arr = [	// меню группы
				{text: 'Свойства', callback: function (ev) { console.log('Свойства', ev); }},
				{text: 'Добавить группу', callback: function (ev) { console.log('Добавить группу', ev); }},
				{text: 'Удалить', callback: function (ev) { console.log('Удалить', ev); }}
			];
		}
		myGmxTree.setContextMenuItems(arr);
	});

*/