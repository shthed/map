/* jshint strict:true, globalstrict:true, browser:true, devel:true */
/* global google, $, dateFormat, maprootJson */
"use strict";

var mapcanvas;
var map;

var nearmap = false;
var nmdates = [];
var nmdate;

var lglayer;
var lglayers = [];

var images; // array of images
var imageselect; // imagery date <select> list for landgate and nearmap
var imageid; // currently selected image
var imageupbtn;
var imagedownbtn;

var headingselect;
var heading = "t";

var controlDiv;
var enableNearmap;
var overlayselect; // chosen multi <select> combobox chozen
var overlayopacity; // overlay opacity range input

var searchInput; // places search html input
var searchBox; // places.SearchBox

var log = function () {};
if (typeof console !== "undefined") {
  log = console.log.bind(console);
}

// map types

// nearmap
var nmMapOpt = {
  name: "Nearmap",
  getTileUrl: function(coord, zoom) {
    var nml = 'Vert';
    if (heading != 't') {
      nml = heading;
    }
    // http://web2.nearmap.com/maps/hl=en&x=430876&y=311305&z=19&nmd=20200202&nml=Vert&httpauth=false&version=2
    // http://web0.nearmap.com/maps/hl=en&x=431091&y=311143&z=19&nml=Vert&httpauth=false&version=2
    var tileUrl = "https://web" + (coord.x % 3) + ".nearmap.com/maps/hl=en&x=" + coord.x + "&y=" + coord.y + "&z=" + zoom;
    if (nmdate) {
      tileUrl += "&nmd=" + nmdate;
    }
    tileUrl += "&nml=" + nml + "&httpauth=false&version=2";
    return tileUrl;
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
};
var nmMapType = new google.maps.ImageMapType(nmMapOpt);

function nearmapenable() {
  nearmap = true;
  enableNearmap.style.display = 'none';
  map.mapTypes.set("Nearmap", nmMapType);
  map.setOptions({
    mapTypeControlOptions: {
      mapTypeIds: mapTypeIds
    }
  }); // reset list of available map types to include Nearmap
  //window.open("http://www.nearmap.com/login", "nearmap", "", true);
  getnmdates();
}

function setnmdate() {
  //log('nearmapdate:'+nmdate);
  nmMapType = new google.maps.ImageMapType(nmMapOpt);
  map.mapTypes.set("Nearmap", nmMapType);
}

var nmdata; // data returned by date query
function gotnmdates(data) {
  if (!data) {
    log('get nearmap dates failed');
    return;
  }
  nmdata = date;
  var dates = data.layers.Vert; // [ "/Date(1193875200000)/" ]
  // todo: parse headings in layers.E__,N__..

  nmdates = [];
  // convert epoch to yyyymmdd
  for (var i in dates) {
    var date = new Date(parseInt(dates[i].slice(6, -2)));
    nmdates.push(dateFormat(date, 'yyyymmdd'));
  }
  nmdates.sort(function(a, b) {
    return b - a;
  }); // descending
  updateimageselect();
}

function getnmdates() {
  var proj = map.getProjection();
  if (!proj) {
    google.maps.event.addListenerOnce(map, 'projection_changed', getnmdates);
    return;
  }
  var cp = proj.fromLatLngToPoint(map.getCenter());
  var x = Math.round(cp.x / 256 * Math.pow(2, map.getZoom()));
  var y = Math.round(cp.y / 256 * Math.pow(2, map.getZoom()));
  var callback = "gotnmdates";
  var nmdateurl = "https://maps.nearmap.com/maps/?x=" + x + "&y=" + y + "&z=" + map.getZoom() + "&nmq=info&nmf=json&nmjsonp=" + callback;
  $.ajax({
    cache: true,
    dataType: 'jsonp',
    url: nmdateurl,
    jsonp: false,
    jsonpCallback: ""
  });
}


function getwmstileurl(coord, zoom, server, layers, size) {
  var proj = map.getProjection();
  var zfactor = Math.pow(2, zoom);
  var top = proj.fromPointToLatLng(new google.maps.Point(coord.x * 256 / zfactor, coord.y * 256 / zfactor));
  var bot = proj.fromPointToLatLng(new google.maps.Point((coord.x + 1) * 256 / zfactor, (coord.y + 1) * 256 / zfactor));
  var bbox = top.lng() + "," + bot.lat() + "," + bot.lng() + "," + top.lat();
  var url = server + "?REQUEST=GetMap" + "&SERVICE=WMS" + "&VERSION=1.1.1" + "&LAYERS=" + layers + "&SRS=EPSG%3A4326" + "&BBOX=" + bbox;
  url += "&WIDTH=" + size + "&HEIGHT=" + size + "&FORMAT=image%2Fpng" + "&STYLES=" + "&TRANSPARENT=TRUE";
  return url;
}


// landgate
var lgMapOpt = {
  name: "Landgate",
  getTileUrl: function(coord, zoom) {
    if (!lglayer) {
      return null;
    }
    return getwmstileurl(coord, zoom, "https://www2.landgate.wa.gov.au/ows/wmscsimagery", lglayer, 256); // this is bad
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
};
var lgMapType = new google.maps.ImageMapType(lgMapOpt);

function setlglayer() {
  //log('setlglayer: ' + lglayer);
  lgMapType = new google.maps.ImageMapType(lgMapOpt);
  map.mapTypes.set("Landgate", lgMapType);
}

function gotlglayers(data) {
  if (!data) {
    log('lglayers failed');
    return;
  }
  if (!data.rows) {
    log('lglayers returned no rows');
    return;
  }
  if (!data.rows.length) {
    log('lglayers returned no data');
    return;
  }

  // [ slip_layer, location_t, capture_fi ]
  lglayers = data.rows;

  // convert capture_fi dates from "12:00:00 MM/DD/YYYY" to "YYYYMMDD"
  for (var i in lglayers) {
    //log(lglayers[i]);
    var date = lglayers[i][2];
    lglayers[i][2] = date.substr(15, 4) + date.substr(9, 2) + date.substr(12, 2);
  }
  lglayers.sort(function(a, b) {
    return b[2] - a[2];
  }); // sort by date descending

  updateimageselect();
}

//https://www2.landgate.wa.gov.au/datadownloads/?
//Landgate Ortho Mosaic Index (LGATE-071)
//https://www2.landgate.wa.gov.au/datadownloads/LGATE-071/?
//https://www2.landgate.wa.gov.au/datadownloads/LGATE-071/LGATE_071_4283_20130619173951_SHP.zip
//ogr2ogr.exe -f kml LGATE-071.kml LGATE_071_4283_data_SHP.shp
// wish this data was availble on slip already
function getlglayers() {
  var bounds = map.getBounds();
  if (!bounds) {
    google.maps.event.addListenerOnce(map, 'bounds_changed', getlglayers);
    return;
  }
  var callback = "gotlglayers";
  var from = "1AMWBL44ptO6vVRkMWpeHSVQfkluByvO7efhEfaYf";
  var key = "AIzaSyA_aPxq2NYNgb067co7W2sUYpi66X9fM_g";
  var rect = "RECTANGLE(LATLNG" + bounds.getSouthWest().toString() + ", LATLNG" + bounds.getNorthEast().toString() + ")";
  var query = "SELECT slip_layer,location_t,capture_fi FROM " + from +
    " WHERE ST_INTERSECTS(geometry, " + rect + ")" +
    " AND slip_layer CONTAINS 'LGATE'" +
    " AND project_cl NOT EQUAL TO 'Map'" +
    " ORDER BY slip_layer ";
  var lgdateurl = "https://www.googleapis.com/fusiontables/v1/query?sql=" + query + "&key=" + key + "&callback=" + callback;
  //log("getlglayers: " + lgdateurl);
  $.ajax({
    cache: true,
    dataType: 'jsonp',
    url: lgdateurl,
    jsonp: false,
    jsonpCallback: ""
  });
}


// landgate firewatch
var fireMapType = new google.maps.ImageMapType({
  name: "Fire Hotspots",
  getTileUrl: function(coord, zoom) {
    //http://t3.srss-ows.landgate.wa.gov.au/mapproxy/firewatch/service?REQUEST=GetMap&SERVICE=WMS&VERSION=1.1.1&LAYERS=layer7_fhs_last_0_72.shp&SRS=EPSG%3A900913&BBOX=115.6640625,-32.10118973232094,115.83984375,-31.95216223802496&WIDTH=256&HEIGHT=256&FORMAT=image%2Fpng&STYLES=&TRANSPARENT=TRUE
    // t1 to t5
    var server = 'http://t' + ((coord.x % 5) + 1) + '.srss-ows.landgate.wa.gov.au/mapproxy/firewatch/service';
    return getwmstileurl(coord, zoom, server, 'layer7_fhs_last_0_72.shp', 256);
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
});



// bing
function tileToQuadKey(x, y, zoom) {
  var quad = "";
  for (var i = zoom; i > 0; i--) {
    var mask = 1 << (i - 1);
    var cell = 0;
    if ((x & mask) !== 0) cell++;
    if ((y & mask) !== 0) cell += 2;
    quad += cell;
  }
  return quad;
}

var bingMapOpt = {
  name: "Bing",
  getTileUrl: function(coord, zoom) {
    // http://ecn.t1.tiles.virtualearth.net/tiles/a3103023232202313201.jpeg?g=1173&n=z   
    // http://ak.t3.tiles.virtualearth.net/tiles/a310302322323.jpeg?g=2371&n=z
    var g = '2371';
    var serv = coord.x % 4;
    var x, y;
    switch (heading) {
      case 't':
        return "http://ak.t" + serv + ".tiles.virtualearth.net/tiles/a" + tileToQuadKey(coord.x, coord.y, zoom) + ".jpeg?g=" + g + "&n=z";
      case 'n':
        x = coord.x;
        y = coord.y;
        break;
      case 's':
        x = Math.pow(2, zoom) - 1 - coord.x;
        y = Math.pow(2, zoom) - 1 - coord.y;
        break;
      case 'e':
        x = coord.y;
        y = Math.pow(2, zoom) - 1 - coord.x;
        break;
      case 'w':
        x = Math.pow(2, zoom) - 1 - coord.y;
        y = coord.x;
        break;
    }
    return "http://ak.t" + serv + ".tiles.virtualearth.net/tiles/svi" + tileToQuadKey(x, y, zoom) + "?g=" + g + "&dir=dir_" + heading + "&n=z";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
};
var bingMapType = new google.maps.ImageMapType(bingMapOpt);



// nokia here.com
var nokiaMapOpt = {
  name: "Nokia",
  getTileUrl: function(coord, zoom) {
    //http://2.maps.nlp.nokia.com/maptile/2.1/maptile/newest/hybrid.day/17/107792/77785/256/png8?token=e6SOIUn7kEPF6ifyF8Pd6w&app_id=FVxnkjwY-D1h1dgvBPVT
    //http://2.maps.nlp.nokia.com/maptile/2.1/maptile/d38d9a851f/hybrid.day/18/215586/155571/256/png8?lg=ENG&app_id=SqE1xcSngCd3m4a1zEGb&token=r0sR1DzqDkS6sDnh902FWQ&xnlp=CL_JSMv2.5.3.1
    //http://3.maps.nlp.nokia.com/maptile/2.1/maptile/d38d9a851f/satellite.day/18/215587/155571/256/jpg?lg=ENG&app_id=SqE1xcSngCd3m4a1zEGb&token=r0sR1DzqDkS6sDnh902FWQ&xnlp=CL_JSMv2.5.3.1
    return "//" + ((coord.x % 4) + 1) + ".maps.nlp.nokia.com/maptile/2.1/maptile/newest/satellite.day/" + zoom + "/" + coord.x + "/" + coord.y + "/256/png8?lg=ENG&app_id=SqE1xcSngCd3m4a1zEGb&token=r0sR1DzqDkS6sDnh902FWQ&xnlp=CL_JSMv2.5.3.1";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
};
var nokiaMapType = new google.maps.ImageMapType(nokiaMapOpt);



// opencyclemap
var cycleMapType = new google.maps.ImageMapType({
  name: "Cycle",
  getTileUrl: function(coord, zoom) {
    return "http://" + "abc" [(coord.x % 3)] + ".tile.opencyclemap.org/cycle/" + zoom + "/" + coord.x + "/" + coord.y + ".png";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
});

// hikebike
var hikebikeMapType = new google.maps.ImageMapType({
  name: "HikeBike",
  getTileUrl: function(coord, zoom) {
    //http://toolserver.org/tiles/hikebike/$%7Bz%7D/$%7Bx%7D/$%7By%7D.png
    //return "http://"+"abc"[(coord.x % 3)]+".hikebike.gpsies.com/" + zoom + "/" + coord.x + "/" + coord.y + ".png";
    return "http://" + "abc" [(coord.x % 3)] + ".www.toolserver.org/tiles/hikebike/" + zoom + "/" + coord.x + "/" + coord.y + ".png";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 19
});

// osm
var osmMapType = new google.maps.ImageMapType({
  name: "OSM",
  getTileUrl: function(coord, zoom) {
    return "http://" + "abc" [(coord.x % 3)] + ".tile.openstreetmap.org/" + zoom + "/" + coord.x + "/" + coord.y + ".png";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 19
});

// outdoors
var outdoorsMapType = new google.maps.ImageMapType({
  name: "Outdoors",
  getTileUrl: function(coord, zoom) {
    return "http://" + "abc" [(coord.x % 3)] + ".tile.thunderforest.com/outdoors/" + zoom + "/" + coord.x + "/" + coord.y + ".png";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 19
});


// street directory, this map sucks, not georeferenced properly!
/*
var sdMapType = new google.maps.ImageMapType({
  name: "StreetDir",
  getTileUrl: function(coord, zoom) {
    return "http://m1.street-directory.com.au/wsgi/sdtile/gettile?l=" + zoom + "&r=" + coord.y + "&c=" + coord.x + "&t=ausway&s=Intimap";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 19
});
*/


// google labels
var labelMapType = new google.maps.ImageMapType({
  name: "Labels",
  getTileUrl: function(coord, zoom) {
    //http://mt0.googleapis.com/vt?lyrs=m@260000000&src=apiv3&hl=en-GB&x=13482&y=9724&z=14&style=50,37%7Csmartmaps
    return "http://mt" + (coord.x % 2) + ".googleapis.com/vt?" + "z=" + zoom + "&x=" + coord.x + "&y=" + coord.y + "&style=50,37%7Csmartmaps";
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
});


// streetview availability
var svMapType = new google.maps.ImageMapType({
  name: "Streetview",
  getTileUrl: function(coord, zoom) {
    //http://mt1.googleapis.com/vt?hl=en-GB&lyrs=svv|cb_client:apiv3&style=40,18&x=53873&y=38928&z=16
    return "http://mt" + (coord.x % 2) + ".googleapis.com/vt?hl=en-GB&lyrs=svv|cb_client:apiv3&style=40,18" + "&x=" + coord.x + "&y=" + coord.y + "&z=" + zoom;
  },
  tileSize: new google.maps.Size(256, 256),
  maxZoom: 21
});


// google cadastre
var cadstyle = [{
  "stylers": [{
    "visibility": "off"
  }]
}, {
  "featureType": "administrative.land_parcel",
  "elementType": "geometry",
  "stylers": [{
    "visibility": "on"
  }]
}];
var cadMapType = new google.maps.StyledMapType(cadstyle, {
  name: "Cadastre"
}); // this doesnt respect minZoom



// light pollution
// http://djlorenz.github.io/astronomy/lp2006/
var lpbounds = {
  0: [
    [0, 0],
    [0, 0]
  ],
  1: [
    [0, 1],
    [0, 1]
  ],
  2: [
    [0, 3],
    [0, 2]
  ],
  3: [
    [0, 7],
    [1, 5]
  ],
  4: [
    [0, 15],
    [2, 11]
  ],
  5: [
    [0, 31],
    [5, 23]
  ],
  6: [
    [0, 63],
    [11, 47]
  ]
};

var lptilesize = 1024;
var lpprevzoom;

function getlptilesize() {
  var z = map.getZoom();
  if (z <= 8) {
    lptilesize = 1024;
  }
  if (z >= 9) {
    lptilesize = 1024 * Math.pow(2, z - 8);
  }
  return new google.maps.Size(lptilesize, lptilesize);
}

var lpMapOpt = {
  getTileUrl: function(coord, zoom) {
    if (zoom < 2) return null;
    var zoom2 = zoom - 2;
    if (zoom2 > 6) zoom2 = 6;
    var x = coord.x % Math.pow(2, zoom2);
    if (x < 0) x = x + Math.pow(2, zoom2);
    if (lpbounds[zoom2][0][0] > x || x > lpbounds[zoom2][0][1] || lpbounds[zoom2][1][0] > coord.y || coord.y > lpbounds[zoom2][1][1]) {
      return null;
    }
    return "http://djlorenz.github.io/astronomy/lp2006/overlay/tiles/tile_" + zoom2 + "_" + x + "_" + coord.y + ".png";
  }
};
var lpMapType;

function lightAdd() {
  if (layers.Light.active) {
    lightRemove();
  }
  lpMapOpt.tileSize = getlptilesize();
  lpMapType = new google.maps.ImageMapType(lpMapOpt);
  addoverlay(lpMapType);
  layers.Light.active = true;
}

function lightRemove() {
  removeOverlayByType(lpMapType);
  layers.Light.active = false;
}

function lpzoomchanged() {
  if (layers.Light.active) {
    var z = map.getZoom();
    if (z >= 9 || (lpprevzoom > 8 && z < 9)) {
      // add overlay again if zoom > 9 or changes to less than 9
      lightAdd();
    }
    lpprevzoom = z;
  }
}


var radarMapType = new google.maps.ImageMapType({
  getTileUrl: function(coord, zoom) {
    return getwmstileurl(coord, zoom, "http://wvs" + (((coord.x + coord.y) % 4) + 1) + ".bom.gov.au/mapcache/meteye", "IDR00010", 256);
  },
  tileSize: new google.maps.Size(256, 256)
});


var gpsiesLayer;

function gpsies() {
  gpsiesLayer = new google.maps.KmlLayer({
    url: 'http://members.ii.net/~rmonk/GpsiesTrack.kmz',
    map: map,
    preserveViewport: true
  });
}

var weatherLayer, cloudLayer;

function weatherAdd() {
  weatherLayer = new google.maps.weather.WeatherLayer({
    map: map
  });
  cloudLayer = new google.maps.weather.CloudLayer();
  cloudLayer.setMap(map);
}

function weatherRemove() {
  log('weatherremove');
  weatherLayer.setMap();
  cloudLayer.setMap();
}


// coordinate layer
function CoordMapType(tileSize) {
  this.tileSize = tileSize;
}

CoordMapType.prototype.getTile = function(coord, zoom, ownerDocument) {
  var div = ownerDocument.createElement('div');
  div.innerHTML = coord;
  div.style.width = this.tileSize.width + 'px';
  div.style.height = this.tileSize.height + 'px';
  div.style.fontSize = '10';
  div.style.borderStyle = 'solid';
  div.style.borderWidth = '1px';
  div.style.borderColor = '#AAAAAA';
  return div;
};
var coordMapType = new CoordMapType(new google.maps.Size(256, 256));


function getEarthBuilderMapType(layerid, name) {
  return new google.maps.ImageMapType({
    name: name,
    getTileUrl: function(coord, zoom) {
      //var v = "110"; // should be a parameter from maprootJson
      var layer = layerid.split(':')[0];
      var v = layerid.split(':')[1];
      return "https://earthbuilder.googleapis.com/" + layer + "/maptile/maps?v=" + v + "&authToken=" + "&x=" + coord.x + "&y=" + coord.y + "&z=" + zoom + "&s=";
    },
    tileSize: new google.maps.Size(256, 256),
    maxZoom: 21
  });
}

// locate asset id
// "09372590152434720789-00913315481290556980-4"
var slipid = maprootJson.id;

var slipMapType = getEarthBuilderMapType(slipid + "/10:110", "SLIP"); // aerial photography

// https://mapsengine.google.com/09372590152434720789-00913315481290556980-4/wmts/?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
// locate wmts layer
function getMapsEngineWMTSMapType(layerid, name) {
  return new google.maps.ImageMapType({
    name: name,
    getTileUrl: function(coord, zoom) {
      var tilematrixset = "EPSG:900913";
      return "https://mapsengine.google.com/" + slipid + "/wmts/?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&STYLE=default&FORMAT=image%2Fpng" +
        "&TILEMATRIXSET=" + tilematrixset + "&LAYER=" + layerid + "&TILEMATRIX=" + tilematrixset + ":" + zoom + "&TILEROW=" + coord.y + "&TILECOL=" + coord.x;
    },
    tileSize: new google.maps.Size(256, 256),
    maxZoom: 21
  });
}

// todo: use mapslt? lyrs=vdb vector_layer_ids, combines multiple maps engine layers instead of loading each separately with WMTS
// https://mts1.googleapis.com/mapslt?hl=en-GB&lyrs=vdb%3Ao%3AANVwnM2ndWI_ys6mhS2sq0xRHwb7vhKfJUxpQkG9a_VakVpBW7FQ9CJKBER2O_gITg0ALhVZYbwvINT4SnApuWNU%7Cum%3A1%2Cvdb%3Ao%3AANVwnM15U3uhz1KFaZ5J2Dg34CWYz8mlSqqkpgKLzBnwGbWd_zDD18HzByqDYKwjcYShNsDN2pDaokAa7vbAfsRO%7Cum%3A1%2Cvdb%3Ao%3AANVwnM2_9zCaq--GsTLP84Ih0kaHjJQsQ-mMZi2UGhvdCicqihDKH0qPrAtSHhVmZaHbqrik8JyeR0dbMydfRDHJ%7Cum%3A1&x=26941&y=19448&z=15&w=256&h=256&source=apiv3&token=74055


function createControls() {
  controlDiv = document.createElement('div');
  controlDiv.style.margin = '3px';
  controlDiv.style.cursor = 'pointer';

  var option; // imageselect list option
  imageselect = document.createElement("select");
  option = document.createElement("option");
  option.setAttribute("value", "");
  option.innerHTML = "Images";
  imageselect.appendChild(option);
  controlDiv.appendChild(imageselect);

  var getDatesUI = document.createElement('button');
  getDatesUI.title = 'refresh images';
  getDatesUI.style.cursor = 'pointer';
  getDatesUI.style.backgroundColor = 'white';
  getDatesUI.innerHTML = '&#8634;';
  controlDiv.appendChild(getDatesUI);
  google.maps.event.addDomListener(getDatesUI, 'click', getdates);

  imageupbtn = document.createElement('button');
  imageupbtn.title = 'newer image';
  imageupbtn.style.cursor = 'pointer';
  imageupbtn.style.backgroundColor = 'white';
  imageupbtn.innerHTML = '&uarr;';
  controlDiv.appendChild(imageupbtn);
  google.maps.event.addDomListener(imageupbtn, 'click', cacheimageupclick);

  imagedownbtn = document.createElement('button');
  imagedownbtn.title = 'older image';
  imagedownbtn.style.cursor = 'pointer';
  imagedownbtn.style.backgroundColor = 'white';
  imagedownbtn.innerHTML = '&darr;';
  controlDiv.appendChild(imagedownbtn);
  google.maps.event.addDomListener(imagedownbtn, 'click', cacheimagedownclick);

  headingselect = document.createElement("select");
  headingselect.onchange = headingchanged;
  option = document.createElement("option");
  option.setAttribute("value", "t");
  option.innerHTML = "Top";
  headingselect.appendChild(option);
  option = document.createElement("option");
  option.setAttribute("value", "n");
  option.innerHTML = "North";
  headingselect.appendChild(option);
  option = document.createElement("option");
  option.setAttribute("value", "e");
  option.innerHTML = "East";
  headingselect.appendChild(option);
  option = document.createElement("option");
  option.setAttribute("value", "s");
  option.innerHTML = "South";
  headingselect.appendChild(option);
  option = document.createElement("option");
  option.setAttribute("value", "w");
  option.innerHTML = "West";
  headingselect.appendChild(option);
  controlDiv.appendChild(headingselect);
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(controlDiv);

  var overlayDiv = document.createElement('div');
  overlayselect = document.createElement("select");
  overlayselect.className = "chosen-select";
  overlayselect.id = "overlayselect";
  overlayselect.multiple = true;
  overlayselect.setAttribute("data-placeholder", "Select overlay..");
  overlayselect.onchange = selectoverlays;
  overlayDiv.appendChild(overlayselect);
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(overlayDiv);

  overlayDiv = document.createElement('div');
  overlayopacity = document.createElement("input");
  overlayopacity.type = "range";
  overlayopacity.min = 0;
  overlayopacity.max = 100;
  overlayopacity.step = 1;
  overlayopacity.value = 50;
  overlayopacity.onchange = setoverlayopacity;
  overlayopacity.oninput = setoverlayopacity;
  overlayDiv.appendChild(overlayopacity);
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(overlayDiv);

  searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.style.width = "300px";
  searchInput.style.margin = "15px";
  searchInput.style.padding = "5px";
  searchInput.onclick = function() {
    this.select();
  };
  //searchInput.oninput = removeplacemarkers;
  searchInput.oninput = searchoninput;
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(searchInput);
  searchBox = new google.maps.places.SearchBox(searchInput);
  google.maps.event.addListener(searchBox, 'places_changed', placeschanged);
}


// places search
var markers = [];
var places = [];

var autoservice = new google.maps.places.AutocompleteService();

function searchoninput() {
  if (!searchInput.value) removeplacemarkers();
  //log(searchInput.value);
  //if (searchInput.value) {
  //  autoservice.getQueryPredictions({ input: searchInput.value, bounds: map.getBounds() }, predictionscallback);
  //}
}

function predictionscallback(predictions, status) {
  if (status != google.maps.places.PlacesServiceStatus.OK) {
    log(status);
    return;
  }
  for (var i in predictions) {
    log(predictions[i].description);
  }
}


function removeplacemarkers() {
  markers.forEach(function(m) {
    m.setMap(null);
  });
}

var markerImage = new Image();
markerImage.crossOrigin = "anonymous";
markerImage.src = '//maps.gstatic.com/mapfiles/place_api/icons/geocode-71.png';

function makeIcon(text) {
  var canvas = document.createElement('canvas');
  var context = canvas.getContext('2d');

  var imgsize = 50;
  var imgxoff = 9;
  var font = '30px sans-serif';
  canvas.height = imgsize;
  var y = canvas.height - 5;
  var x = imgsize -imgxoff;
  context.font = font;
  canvas.width = context.measureText(text).width + 3 + imgsize - imgxoff;
  context.drawImage(markerImage, -imgxoff, 0, imgsize, imgsize);
  context.font = font;
  context.textBaseline = 'bottom';
  context.shadowColor = 'black';
  context.shadowBlur = 8;
  context.lineWidth = 5;
  context.strokeStyle = 'black';
  context.strokeText(text, x, y);
  context.fillStyle = 'white';
  context.fillText(text, x, y);

  return {
    url: canvas.toDataURL(),
    anchor: new google.maps.Point(8, 25),
    scaledSize: new google.maps.Size(canvas.width/2, canvas.height/2)
  };
}  

function placeschanged() {
  removeplacemarkers();

  places = searchBox.getPlaces();
  if (!places || places.length === 0) return;

  // For each place, get the icon, place name, and location.
  markers = [];
  
  var bounds = new google.maps.LatLngBounds();
  var wabounds = new google.maps.LatLngBounds(new google.maps.LatLng(-36, 112), new google.maps.LatLng(-13, 130));

  places.forEach(function(place) {
    
    if (!wabounds.contains(place.geometry.location)) return;

    var marker = new google.maps.Marker({
      map: map,
      icon: makeIcon(place.name),
      title: place.name,
      position: place.geometry.location
    });

    //todo: support highlighting localities
    // get highlight id from place url?
    //https://mts0.google.com/vt/lyrs=highlight:0x2a32b80fd3fca643:0x504f0b535df5230@1%7Cstyle:maps&hl=en&src=app&expIds=201527&rlbl=1&x=3368&y=2431&z=12&s=Galileo

    markers.push(marker);

    bounds.extend(place.geometry.location);
    if (place.geometry.viewport) {
      bounds.union(place.geometry.viewport);
    }
  });

  if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
    // if bounds is a point, dont zoom
    map.panTo(bounds.getCenter());
  }
  else if (!bounds.equals(new google.maps.LatLngBounds())) {
    // bounds has actually changed
    map.fitBounds(bounds);
  }
}


function getdates() {
  if (map.getMapTypeId() == "Nearmap") getnmdates();
  if (map.getMapTypeId() == "Landgate") getlglayers();
}


function updateimageselect() {
  var i;
  var oldimageid = imageid;
  // [ date, type, id, name ]
  images = [];

  if (map.getMapTypeId() == "Landgate") {
    if (!lglayer) lglayer = lglayers[0][0];
    imageid = lglayer;
  }
  for (i in lglayers) {
    images.push([lglayers[i][2], 'lg', lglayers[i][0], lglayers[i][1]]);
  }

  if (map.getMapTypeId() == "Nearmap") {
    if (!nmdate) nmdate = nmdates[0];
    imageid = nmdate;
  }
  for (i in nmdates) {
    images.push([nmdates[i], 'nm', nmdates[i], 'nearmap']);
  }

  images.sort(function(a, b) {
    return b[0] - a[0];
  }); // sort by date descending

  var imagefound = false;
  imageselect.innerHTML = '';

  //for (var i = 0; i < images.length; i++) {
  for (i in images) {
    var option = document.createElement("option");
    option.setAttribute("value", images[i][2]);
    if (images[i][1] == 'lg') {
      option.innerHTML = images[i][0] + " " + images[i][2] + " " + images[i][3];
    }
    else {
      option.innerHTML = images[i][0] + " " + images[i][3];
    }

    if (imageid == images[i][2]) {
      option.selected = 'true';
      imagefound = true;
    }
    imageselect.appendChild(option);
  }

  imageselect.onchange = selectimage;
  imageselect.onkeyup = imageselect.onchange; // to support firefox select change with keyboard

  // should only select the correct type of image, not just first one?
  if (!imageid || !imagefound) {
    //imageid = images[0][0];
    imageselect.selectedIndex = 0;
    imageselect.onchange();
  }
  else if (imageid != oldimageid) {
    imageid = ''; // force layer to be set again
    imageselect.onchange();
  }
}

function selectimage() {
  // skip already selected image
  if (imageid == imageselect.value) {
    return;
  }
  imageid = imageselect.value;

  if (imageid.substr(0, 5) == 'LGATE') {
    lglayer = imageid;
    setlglayer();
    map.setMapTypeId('Landgate');
  }
  else {
    nmdate = imageid;
    setnmdate();
    map.setMapTypeId('Nearmap');
  }
}


// auto image load / cache
var cacheimageupdo;
var cacheimagedowndo;

function cacheimageupclick() {
  if (!cacheimageupdo) {
    if (cacheimagedowndo) cacheimagedownclick();
    cacheimageupdo = true;
    imageupbtn.innerHTML = '&otimes;';
    cacheimagemap();
  }
  else {
    cacheimageupdo = false;
    imageupbtn.innerHTML = '&uarr;';
  }
}

function cacheimagedownclick() {
  if (!cacheimagedowndo) {
    if (cacheimageupdo) cacheimageupclick();
    cacheimagedowndo = true;
    imagedownbtn.innerHTML = '&otimes;';
    cacheimagemap();
  }
  else {
    cacheimagedowndo = false;
    imagedownbtn.innerHTML = '&darr;';
  }
}

var cachetimer;
var cachetimeout = 1000;

function cacheimagemap() {
  log('cacheimagemap');
  if (!cacheimageupdo && !cacheimagedowndo) {
    log('cacheimagemap stop');
    return;
  }

  if ((cacheimageupdo && imageselect.selectedIndex > 0) || (cacheimagedowndo && imageselect.selectedIndex + 1 < imageselect.options.length)) {
    google.maps.event.addListenerOnce(map, 'tilesloaded', function() {
      cachetimer = window.setTimeout(cacheimagemap, cachetimeout);
      //cacheimagemap();
    });
    if (cacheimageupdo) imageselect.selectedIndex--;
    if (cacheimagedowndo) imageselect.selectedIndex++;
    imageselect.onchange();
  }
  else {
    // reached the end
    if (cacheimageupdo) cacheimageupclick();
    if (cacheimagedowndo) cacheimagedownclick();
  }
}


// parsing wms getcapabilities
var wmslayers = [];
var wmsxml;

function getwmslayers() {
  // https://mapsengine.google.com/09372590152434720789-00913315481290556980-4/wms/?request=GetCapabilities
  // https://mapsengine.google.com/09372590152434720789-00913315481290556980-4/wmts/?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
  $.ajax({
    type: "GET",
    url: "slipwms.xml",
    dataType: "xml",
    success: function(xml) {
      wmsxml = xml;
    }
  });
}

function parsewmsxml() {
  $(wmsxml).find('Layer').each(function() {
    wmslayers.push([$(this).children("Name").text(), $(this).children("Title").text()]);
  });
}


function setOpacity(type) {
  if (type.setOpacity) {
    type.setOpacity(Number(overlayopacity.value) / 100);
  }
}

function setoverlayopacity() {
  map.overlayMapTypes.forEach(function(e) {
    setOpacity(e);
  });
}

function addoverlay(type) {
  setOpacity(type);
  map.overlayMapTypes.insertAt(0, type);
}

function startsWith(s, w) {
  return s.slice(0, w.length) == w;
}

var overlays = {}; // currently selected overlays

function getlayerid(layerid) {
  // reconstruct shortened layerid
  if (startsWith(layerid, "V:")) {
    return maprootJson.id.split('-')[0] + "-" + layerid.slice(2) + "-4";
  }
  if (startsWith(layerid, "I:")) {
    return maprootJson.id + "/" + layerid.slice(2);
  }
}

function selectoverlays() {
  var prev = overlays;
  overlays = {};
  //opts = overlayselect.selectedOptions;  // not supported in IE

  $(overlayselect).find("option:selected").each(function() {
    var layerid = this.value;
    overlays[layerid] = true;
    if (!prev[layerid]) {
      //log('added '+ layerid);
      if (startsWith(layerid, "V:")) {
        addoverlay(getMapsEngineWMTSMapType(getlayerid(layerid), layerid));
      }
      else if (startsWith(layerid, "I:")) {
        addoverlay(getEarthBuilderMapType(getlayerid(layerid), layerid));
      }
      else if (layers[layerid]) {
        var l = layers[layerid];
        if (l.type) {
          addoverlay(l.type);
        }
        else if (l.add) {
          l.add();
        }
      }
    }
  });

  // remove overlays no longer selected
  for (var l in prev) {
    if (!overlays[l]) {
      //log('removed '+ l);
      if (layers[l]) {
        if (layers[l].remove) {
          layers[l].remove();
        }
        else if (layers[l].type) {
          removeOverlayByType(layers[l].type);
        }
        else {
          log('cant remove ' + l);
        }
      }
      else {
        removeOverlayByName(l);
      }
    }
  }
  saveview();
}

function removeOverlayByType(type) {
  var i = map.overlayMapTypes.indexOf(type);
  if (i >= 0) {
    map.overlayMapTypes.removeAt(i);
  }
}

function removeOverlayByName(layername) {
  map.overlayMapTypes.forEach(function(e, i) {
    if (e && e.name == layername) {
      map.overlayMapTypes.removeAt(i);
    }
  });
}

// parse maprootJson layers from locate map viewer
// should store these and their properties
function parselayers(lays, parent) {
  var option, optgroup;
  for (var i in lays) {
    var lay = lays[i];
    if (lay.id) {
      // add to list of overlays
      //log(lay.title);
      option = document.createElement("option");
      if (lay.source.google_maps_engine.sub_type == "VECTOR") {
        // get just the last unique digits from id 000-123-4 (123)
        option.setAttribute("value", "V:" + lay.id.split('-')[1]);
      }
      if (lay.source.google_maps_engine.sub_type == "IMAGE") {
        // get just the last digits after /  000-123/45 (45)
        option.setAttribute("value", "I:" + lay.source.google_maps_engine.image_layer.asset_id.split('/')[1] + ':' + lay.source.google_maps_engine.image_layer.epoch);
      }
      option.innerHTML = lay.title;
      parent.appendChild(option);
    }
    // recursively add sublayers
    if (lay.sublayers) {
      optgroup = document.createElement("optgroup");
      if (parent.label) {
        optgroup.label = parent.label + ' - ' + lay.title;
      }
      else {
        optgroup.label = lay.title;
      }
      overlayselect.appendChild(optgroup);
      parselayers(lay.sublayers, optgroup);
    }
  }
}

function addoption(value, title, parent) {
  var option = document.createElement("option");
  option.setAttribute("value", value);
  option.innerHTML = title;
  parent.appendChild(option);
}

function createOverlaySelect() {
  var optgroup = document.createElement("optgroup");
  // add default overlays
  optgroup.label = "Overlays";
  for (var layer in layers) {
    var l = layers[layer];
    if (l.over && !l.disabled) {
      addoption(l.id, l.name, optgroup);
    }
  }
  overlayselect.appendChild(optgroup);

  if (typeof maprootJson !== "undefined") {
    parselayers(maprootJson.layers, overlayselect);
  }

  $(overlayselect).chosen({
    width: "300px"
  });
  // auto resize chosen drop down window to fill window height
  $(overlayselect).chosen().on('chosen:showing_dropdown', function() {
    $('.chosen-results').css('max-height', function() {
      return window.innerHeight - this.getBoundingClientRect().top;
    });
  });
}


// setheading rotates images with css transform for bing tiles
function setheading() {
  mapcanvas.setAttribute('class', 'heading_' + heading);
}

function headingchanged() {
  heading = headingselect.value;
  if (map.getMapTypeId() == "Bing") {
    bingMapType = new google.maps.ImageMapType(bingMapOpt);
    map.mapTypes.set("Bing", bingMapType);
  }
  else if (map.getMapTypeId() == "Nearmap") {
    nmMapType = new google.maps.ImageMapType(nmMapOpt);
    map.mapTypes.set("Nearmap", nmMapType);
  }
  else if (map.getMapTypeId() == "satellite" && map.getTilt() == 45) {
    switch (headingselect.value) {
      case 't':
      case 'n':
        map.setHeading(0);
        break;
      case 'e':
        map.setHeading(90);
        break;
      case 's':
        map.setHeading(180);
        break;
      case 'w':
        map.setHeading(270);
        break;
    }
    heading = 't';
  }
  else {
    heading = 't';
  }
  setheading();
}

function zoomchanged() {
  lpzoomchanged();
  saveview();
}

function centerchanged() {
  saveview();
}

function maptypechanged() {
  headingchanged(); // update heading
  if (map.getMapTypeId() == "Landgate") {
    if (!lglayer) {
      getlglayers();
    }
    else {
      updateimageselect();
    }
  }
  if (map.getMapTypeId() == "Nearmap") {
    if (!nmdate) {
      getnmdates();
    }
    else {
      updateimageselect();
    }
  }
  saveview();
}

function mapidle() {
  saveview();
  searchBox.setBounds(map.getBounds());
}

var isloadingview = false; // prevent saving the view while loading it

function saveview() {
  if (isloadingview) return;

  var pt = map.getCenter();
  var z = map.getZoom();
  if (pt && z) {
    var view = '#' + pt.lat().toFixed(z / 3) + ',' + pt.lng().toFixed(z / 3) + ',' + map.getZoom();

    if (map.getMapTypeId()) {
      view += ',' + map.getMapTypeId();
    }

    $(overlayselect).find(":selected").each(function() {
      view += ',' + this.value;
    });

    window.history.replaceState({}, 'map', view);
  }
}

function loadview() {
  isloadingview = true;
  // map.html#lat,long,zoom[,base][,overlay...]
  var params = window.location.hash.substr(1).split(',');
  var view = params.slice(0, 3).map(Number);
  var maptype = params[3];
  var overlays = params.slice(4); // all other params

  if (!isNaN(view[0]) && !isNaN(view[1]) && !isNaN(view[2])) {
    map.setCenter(new google.maps.LatLng(view[0], view[1]));
    map.setZoom(view[2]);
  }
  else {
    geolocate();
  }

  if (maptype && mapTypeIds.indexOf(maptype) > -1) {
    map.setMapTypeId(maptype);
  }
  else {
    map.setMapTypeId(initialmap);
  }

  if (overlays) {
    for (var l in overlays) {
      // find the option and select it
      $(overlayselect).find("option[value='" + overlays[l] + "']").prop('selected', true);
    }
    $(overlayselect).trigger('chosen:updated');
    selectoverlays();
  }
  isloadingview = false;
  saveview();
}


function geolocated(pos) {
  map.setCenter(new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude));
  // convert position accuracy into zoom level
  var x = window.innerWidth;
  var y = window.innerHeight;
  var zoom = Math.round(18 - Math.log(3.3 * pos.coords.accuracy / Math.sqrt(x * x + y * y)) / Math.log(2));
  map.setZoom(zoom);
}

function geofail() {
  $.get("http://ipinfo.io/loc", function(loc) {
    var pos = loc.split(',').map(Number);
    //console.log("ipinfo: "+ pos);
    if (!isNaN(pos[0]) && !isNaN(pos[0])) {
      map.setCenter(new google.maps.LatLng(pos[0], pos[1]));
      map.setZoom(14); // should look at precision of pos
    }
  });
  // should have another fallback..
}

function geolocate() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(geolocated, geofail);
  }
  else {
    geofail();
  }
}


var layers = {
  "Labels": {
    name: "Google Labels",
    type: labelMapType,
    over: true
  },
  "Cadastre": {
    name: "Google Cadastre",
    type: cadMapType,
    over: true
  },
  "Streetview": {
    name: "Google Streetview",
    type: svMapType,
    over: true
  },
  "OSM": {
    name: "Open Street Map",
    type: osmMapType,
    base: true,
    over: true
  },
  "HikeBike": {
    name: "Hike & Bike",
    type: hikebikeMapType,
    base: true,
    over: true
  },
  "Cycle": {
    name: "Open Cycle Map",
    type: cycleMapType,
    base: true,
    over: true
  },
  "Outdoors": {
    type: outdoorsMapType,
    base: true,
    over: true
  },
  "Nokia": {
    type: nokiaMapType,
    base: true
  },
  "Bing": {
    type: bingMapType,
    base: true
  },
  "SLIP": {
    type: slipMapType,
    base: true,
    initial: true
  },
  "Landgate": {
    type: lgMapType,
    base: true
  },
  "Nearmap": {
    type: nmMapType,
    base: true
  },
  "Light": {
    name: "Light Pollution",
    add: lightAdd,
    remove: lightRemove,
    active: false,
    over: true
  },
  "Radar": {
    name: "Weather Radar",
    type: radarMapType,
    over: true
  },
  "Fire": {
    name: "Fire Hotspots",
    type: fireMapType,
    over: true
  },
  "Weather": {
    name: "Google Weather",
    add: weatherAdd,
    remove: weatherRemove,
    over: false
  },
  "Coords": {
    name: "Coordinates",
    type: coordMapType,
    over: true
  }
};

var mapTypeIds = [];
var initialmap;

function initialize() {
  var l, layer;
  // set default id and name
  for (layer in layers) {
    l = layers[layer];
    if (!l.id) {
      l.id = layer;
    }
    if (!l.name) {
      l.name = layer;
    }
    if (l.initial) {
      initialmap = l.id;
    } //remember the initial map
  }

  for (var m in google.maps.MapTypeId) {
    mapTypeIds.push(google.maps.MapTypeId[m]);
  }
  for (layer in layers) {
    l = layers[layer];
    if (l.base) {
      mapTypeIds.push(l.id);
    }
  }
  mapTypeIds.reverse();

  google.maps.visualRefresh = true;
  mapcanvas = document.getElementById("map_canvas");
  map = new google.maps.Map(mapcanvas, {
    mapTypeControlOptions: {
      mapTypeIds: mapTypeIds
    },
    rotateControl: true
  });

  createControls();
  createOverlaySelect();

  google.maps.event.addListener(map, 'maptypeid_changed', maptypechanged);
  google.maps.event.addListener(map, 'tilt_changed', headingchanged);
  google.maps.event.addListener(map, 'zoom_changed', zoomchanged);
  google.maps.event.addListener(map, 'idle', mapidle);

  // install base layers
  for (layer in layers) {
    l = layers[layer];
    if (l.base && l.type && (typeof l.type === "object") && !(l.disabled)) {
      map.mapTypes.set(l.id, l.type);
    }
  }

  if (document.location.hash) {
    loadview();
  }
  else {
    map.setMapTypeId(initialmap); // set initial base layer
    geolocate();
  }
}

google.maps.event.addDomListener(window, 'load', initialize);
