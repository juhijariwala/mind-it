var mindMapService = new MindMapService();

var tracker = {
  added: function (id, fields) {
    var newNode = map.getNodeData(id);
    if (newNode)
      return;
    newNode = fields;
    newNode._id = id;
    var parent = map.getNodeData(newNode.parent_ids[newNode.parent_ids.length - 1]);
    map.addNodeToUI(parent, newNode);
    App.nodeSelector.setPrevDepth(newNode.parent_ids.length);
  },
  changed: function (id, fields) {
    var updatedNode = map.getNodeData(id);
    if (!updatedNode) return;

    updatedNode.previous = fields.hasOwnProperty('previous') ? fields.previous : updatedNode.previous;
    updatedNode.next = fields.hasOwnProperty('next') ? fields.next : updatedNode.next;

    if (fields.hasOwnProperty('name')) {
      updatedNode.name = fields.name;
      App.chart.update();
      var selectedNode = map.selectedNodeData();
      // redraw gray box
      if (selectedNode && selectedNode._id === id) {
        setTimeout(function () {
          App.selectNode(selectedNode);
        }, 10);
      }
    }
  },
  just_deleted: null,
  removed: function (id) {
    var deletedNode = map.getNodeData(id);
    if (!deletedNode) return;

    var alreadyRemoved = deletedNode.parent_ids.some(function (parent_id) {
      return tracker.just_deleted == parent_id;
    });
    if (alreadyRemoved) return;

    var children = deletedNode.parent[deletedNode.position] || deletedNode.parent.children;

    var delNodeIndex = children.indexOf(deletedNode);
    if (delNodeIndex >= 0) {
      children.splice(delNodeIndex, 1);
      App.chart.update();
      tracker.just_deleted = id;
    }
  }
};

function retainCollapsed() {
  for (var i = 0; i < localStorage.length; i++) {
    try {
      if (isLocallyCollapsed(localStorage.key(i))) {
        var nodeId = localStorage.key(i);
        var nodeData = map.getNodeData(nodeId);
        collapse(nodeData, nodeId);
      }
    }
    catch (e) {
    }
  }
}

var getChartInFocus = function () {
  var body = $('body')[0],
    scrollWidth = body.scrollWidth - body.clientWidth,
    scrollHeight = body.scrollHeight - body.clientHeight;
  $(window).scrollLeft(scrollWidth / 2);
  $(window).scrollTop(scrollHeight / 2);
};

var update = function (data) {
  window.data = data;
  d3.select('#mindmap svg')
    .datum(data)
    .call(App.chart);
  App.chart.update();
  getChartInFocus();
};

Template.create.rendered = function rendered() {

  var tree = mindMapService.buildTree(this.data.id, this.data.data);
  update(tree);
  var rootNode = d3.selectAll('.node')[0].find(function (node) {
    return !node.__data__.position;
  });

  App.select(rootNode);
  Mindmaps.find().observeChanges(tracker);

  retainCollapsed();
  d3.select("#help-link").on('click', enableHelpLink);

  App.setMapsCount();
};

var enableHelpLink = function () {
  $('#help-modal').modal('show');
};

var getDirection = function (data) {
  if (!data) {
    return 'root';
  }
  if (data.position) {
    return data.position;
  }
  return getDirection(data.parent);
};

map = {};
map.selectedNodeData = function () {
  var selectedNode = d3.select(".node.selected")[0][0];
  return selectedNode ? selectedNode.__data__ : null;
};
map.addNodeToUI = function (parent, newNode) {
  var children = parent[newNode.position] || parent.children || parent._children;
  if (!children) {
    children = parent.children = [];
  }
  if (newNode.previous) {
    var previousNode = children.find(function (x) {
        return x._id == newNode.previous
      }),
      previousNodeIndex = children.indexOf(previousNode) + 1;
    children.splice(previousNodeIndex, 0, newNode);
  } else if (newNode.next) {
    children.splice(0, 0, newNode);
  } else
    children.push(newNode);
  App.chart.update();
};

function calculateDirection(parent) {

  var dir = getDirection(parent);
  var selectedNode = map.selectedNodeData();

  if (dir === 'root') {
    if (getDirection(selectedNode) === 'root') {
      App.DirectionToggler.canToggle = true;
      dir = App.DirectionToggler.currentDir;
    }
    else
      dir = selectedNode.position;
  }

  return dir;
}

map.addNewNode = function (parent, newNodeName, dir, previousSibling) {

  if (!previousSibling) {
    var children = parent.position ? parent.children : parent[dir];

    previousSibling = children && children.length > 0
      ? children[children.length - 1]
      : {_id: null, next: null};
  }
  var newNode = {
    name: newNodeName, position: dir,
    parent_ids: [].concat(parent.parent_ids || []).concat([parent._id]),
    previous: previousSibling._id, next: previousSibling.next
  };
  newNode._id = mindMapService.addNode(newNode);

  if (previousSibling._id) {
    mindMapService.updateNode(previousSibling._id, {next: newNode._id});
    mindMapService.updateNode(newNode.next, {previous: newNode._id});
  }

  // let the subscribers to update their mind map :)

  return newNode;
};

map.makeEditable = function (nodeId) {
  var node = d3.selectAll('#mindmap svg .node').filter(function (d) {
    return d._id == nodeId
  })[0][0];
  if (node)
    App.showEditor(node);
};

map.findOne = function (node, fun) {

  if (fun(node)) return node;
  var children = (node.children || node._children || []),
    res = children.reduce(function (result, child) {
      return result || map.findOne(child, fun);
    }, null);
  return res;
};
map.getNodeData = function (nodeId) {
  var rootNodeData = d3.selectAll('#mindmap svg .node.level-0')[0][0].__data__;
  return map.findOne(rootNodeData, function (x) {
    return x._id == nodeId
  });
};

clone = function (node) {
  var clonedNode = {name: node.name, position: node.position};
  clonedNode.children = (node.children || node._children || []).map(function (currentElem) {
    return clone(currentElem);
  });
  if (node.depth == 0) {
    clonedNode.left = clonedNode.children.filter(function (x) {
      return x.position == 'left'
    });
    clonedNode.right = clonedNode.children.filter(function (x) {
      return x.position == 'right'
    });
  }
  return clonedNode;
};

function cloneObject(obj) {
  if (null == obj || "object" != typeof obj) return obj;
  var copy = obj.constructor();
  for (var attr in obj) {
    if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
  }
  return copy;
}

map.storeSourceNode = function (sourceNode) {
  map.sourceNode = cloneObject(sourceNode);
};

map.getSourceNode = function () {
  return d3.select(".selected")[0][0].__data__;
};

Mousetrap.bind('mod+x', function () {
  cut();
});

function checkOverlapRect(rect1) {
  var rectList = d3.select('svg').select('g').selectAll('g');
  for (var i = 0; i < rectList[0].length; i++) {
    var rectPoint = d3.select(rectList[0][i]).attr('transform').replace('translate(', '').replace(')', '').split(',');

    var currHeight = (d3.select(rectList[0][i]).select('rect').attr('height') * 1), currWidth = (d3.select(rectList[0][i]).select('rect').attr('width') * 1),
      currX = rectPoint[0] * 1 - (currWidth / 2), currY = rectPoint[1] * 1 + (currHeight / 2),
      leftTop = {x: currX, y: currY},
      rightTop = {x: (currX + currWidth), y: currY},
      leftBottom = {x: currX, y: currY + currHeight},
      rightBottom = {x: currX + currWidth, y: currY + currHeight};

    if (rect1[0] * 1 >= currX && rect1[0] * 1 <= currX + currWidth && rect1[1] * 1 <= currY && rect1[1] * 1 >= currY - currHeight) {
      return rectList[0][i];
    }
  }
}

checkOverlap = checkOverlapRect;

function cut(asyncCallBack) {
  var sourceNode = map.getSourceNode();
  if (getDirection(sourceNode) === 'root') {
    alert("The root node cannot be cut!");
    return;
  }
  map.storeSourceNode(sourceNode);
  var selectedNodeIndex = (sourceNode.parent.children || []).indexOf(sourceNode);
  Meteor.call('deleteNode', sourceNode._id, function (err, data) {
    focusAfterDelete(sourceNode, selectedNodeIndex);
    if (asyncCallBack)
      asyncCallBack(err, data);
  });
}

cutNode = cut;

Mousetrap.bind('mod+c', function () {
  var sourceNode = map.getSourceNode();
  map.storeSourceNode(sourceNode);
});

Mousetrap.bind('mod+v', function () {
  var targetNode = map.selectedNodeData();
  var sourceNode = map.sourceNode;
  var dir = calculateDirection(targetNode);
  if (targetNode.isCollapsed)
    expandRecursive(targetNode, targetNode._id);
  paste(sourceNode, targetNode, dir);
  retainCollapsed();
});

Mousetrap.bind('enter', function () {
  var selectedNode = map.selectedNodeData();
  if (!selectedNode) return false;
  var parent = selectedNode.parent || selectedNode,
    sibling = selectedNode.position ? selectedNode : null,
    dir = calculateDirection(parent);

  App.deselectNode();
  var newNode = map.addNewNode(parent, "", dir, sibling);
  map.makeEditable(newNode._id);
  return false;
});

$(window).keyup(function (event) {
  if (event.keyCode == 113) { // F2
    (event.preventDefault || event.stop || event.stopPropagation || function () {
    }).call(event);
    var selectedNode = d3.select(".node.selected")[0][0];
    if (!selectedNode) return;
    App.showEditor.call(selectedNode);
  }
});

Mousetrap.bind('tab', function () {
  var selectedNode = map.selectedNodeData();
  if (!selectedNode) return false;
  if (selectedNode.hasOwnProperty('isCollapsed') && selectedNode.isCollapsed) {
    expand(selectedNode, selectedNode._id);
  }
  var dir = calculateDirection(selectedNode);
  App.deselectNode();
  var newNode = map.addNewNode(selectedNode, "", dir);
  map.makeEditable(newNode._id);
  return false;
});

Mousetrap.bind('del', function () {
  var selectedNode = map.selectedNodeData();
  if (!selectedNode) return;
  var dir = getDirection(selectedNode);

  if (dir === 'root') {
    alert('Can\'t delete root');
    return;
  }
  var children = selectedNode.parent[dir] || selectedNode.parent.children;
  if (!children) {
    alert('Could not locate children');
    return;
  }
  var selectedNodeIndex = children.indexOf(selectedNode);
  Meteor.call('deleteNode', selectedNode._id, function () {
    focusAfterDelete(selectedNode, selectedNodeIndex);
  });


});

function focusAfterDelete(selectedNode, removedNodeIndex) {
  var parent = selectedNode.parent,
    children = parent[selectedNode.position] || parent.children || [],
    nextNode = children[removedNodeIndex],
    previousNode = children[removedNodeIndex - 1];
  App.selectNode(nextNode || previousNode || parent);
}

function findLogicalUp(node) {
  var dir = getDirection(node);
  if (dir === 'root') return;

  var p = node.parent, nl = p.children || [], i = 1;
  if (p[dir]) {
    nl = p[dir];
  }
  var l = nl.length;
  for (; i < l; i++) {
    if (nl[i]._id === node._id) {
      App.selectNode(findSameLevelChild(nl[i - 1], App.nodeSelector.prevDepthVisited, 0));
      break;
    }
  }
  if (nl[0]._id === node._id)
    findLogicalUp(p);
}


Mousetrap.bind('up', function () {
  // up key pressed
  var event = arguments[0];
  (event.preventDefault || event.stop || event.stopPropagation || function () {
  }).call(event);
  var selection = d3.select(".node.selected")[0][0];
  if (selection) {
    var data = selection.__data__;
    var dir = getDirection(data);
    switch (dir) {
      case('root'):
        break;
      case('left'):
      case('right'):
        findLogicalUp(data);
        break;
    }
  }
  return false;
});

function findSameLevelChild(node, depth, downwards) {
  var index;
  if (downwards)
    index = 0;
  if (!node.children)
    return node;
  if (node.depth == depth) {
    return node;
  }
  while (node.children) {
    if (!downwards)
      index = node.children.length - 1;
    node = node.children[index];
    if (node.depth == depth) {
      return node;
    }
  }
  return node;
}

function findLogicalDown(node) {
  var dir = getDirection(node);
  if (dir === 'root') return;
  var p = node.parent, nl = p.children || [], i = 0;
  if (p[dir]) {
    nl = p[dir];
  }
  var l = nl.length;
  for (; i < l - 1; i++) {
    if (nl[i]._id === node._id) {
      App.selectNode(findSameLevelChild(nl[i + 1], App.nodeSelector.prevDepthVisited, 1));
      //selectNode(nl[i + 1]);
      return;
    }
  }
  if (i == l - 1) findLogicalDown(p);
}

Mousetrap.bind('down', function () {
  // down key pressed
  var event = arguments[0];
  (event.preventDefault || event.stop || event.stopPropagation || function () {
  }).call(event);
  var selection = d3.select(".node.selected")[0][0];
  if (selection) {
    var data = selection.__data__;
    var dir = getDirection(data);
    switch (dir) {
      case('root'):
        break;
      case('left'):
      case('right'):
        findLogicalDown(data);
        break;
    }
  }
  return false;
});

function paste(sourceNode, targetNode, dir, previousSibling) {
  var newNode = map.addNewNode(targetNode, sourceNode.name, dir, previousSibling),
    childrenArray;
  if (sourceNode.hasOwnProperty('children') && sourceNode.children) {
    childrenArray = sourceNode.children;
  }
  else if (sourceNode.hasOwnProperty('_children') && sourceNode._children) {
    childrenArray = sourceNode._children;
  }
  if (sourceNode.hasOwnProperty('isCollapsed') && sourceNode.isCollapsed) {
    newNode.isCollapsed = sourceNode.isCollapsed;
    storeLocally(newNode);
  }
  if (childrenArray) {
    var previous = null;
    childrenArray.forEach(
      function (d) {
        previous = paste(d, newNode, dir, previous);
      }
    );
  }
  ;
  return newNode;
}

pasteNode = paste;

Mousetrap.bind('left', function () {
  var event = arguments[0];
  (event.preventDefault || event.stop || event.stopPropagation || function () {
  }).call(event);
  // left key pressed
  var selection = d3.select(".node.selected")[0][0];
  if (selection) {
    var data = selection.__data__;
    var dir = getDirection(data), node;
    switch (dir) {
      case('right'):
      case('root'):
        node = data.parent || data.left[0];
        break;
      case('left'):
        if (data.hasOwnProperty('isCollapsed') && data.isCollapsed) {
          expand(data, data._id);
        }
        else {
          node = (data.children || [])[0];
        }
        break;
      default:
        break;
    }
    App.selectNode(node);
    if (node)
      App.nodeSelector.setPrevDepth(node.depth);
  }
});

Mousetrap.bind('right', function () {
  var event = arguments[0];
  (event.preventDefault || event.stop || event.stopPropagation || function () {
  }).call(event);
  // right key pressed
  var selection = d3.select(".node.selected")[0][0];
  if (selection) {
    var data = selection.__data__;
    var dir = getDirection(data), node;
    switch (dir) {
      case('left'):
      case('root'):
        node = data.parent || data.right[0];
        break;
      case('right'):
        if (data.hasOwnProperty('isCollapsed') && data.isCollapsed) {
          expand(data, data._id);
        }
        else {
          node = (data.children || [])[0];
        }
        break;
      default:
        break;
    }
    App.selectNode(node);
    if (node)
      App.nodeSelector.setPrevDepth(node.depth);
  }
});


function storeLocally(d) {
  var state = {isCollapsed: d.isCollapsed};
  localStorage.setItem(d._id, JSON.stringify(state));
}

function removeLocally(d) {
  localStorage.removeItem(d._id);
}

function isLocallyCollapsed(id) {
  try {
    var locallyCollapsed = JSON.parse(localStorage.getItem(id)).isCollapsed;
  }
  catch (e) {
  }
  return locallyCollapsed ? true : false;
}

function collapseRecursive(d, id) {
  if (d._id === id) {
    d.isCollapsed = true;
    storeLocally(d);
  }
  if (d.hasOwnProperty('children') && d.children) {
    d._children = [];
    d._children = d.children;
    d._children.forEach(collapseRecursive);
    d.children = null;
  }

}
function collapse(d, id) {
  collapseRecursive(d, id);
  App.chart.update();
}

function expandRecursive(d, id) {
  if (d._id === id) {
    d.isCollapsed = false;
    removeLocally(d);
  }
  // On refresh - If child node is collapsed do not expand it
  if (isLocallyCollapsed(d._id) == true)
    d.isCollapsed = true;
  if (d.hasOwnProperty('_children') && d._children && !d.isCollapsed) {
    d.children = d._children;
    d._children.forEach(expandRecursive);
    d._children = null;
  }
}

function expand(d, id) {
  expandRecursive(d, id);
  App.chart.update();
}

window.toggleCollapsedNode = function (selected) {
  var dir = getDirection(selected);
  if (dir !== 'root') {
    if (selected.hasOwnProperty('_children') && selected._children) {
      expand(selected, selected._id);
    }
    else {
      collapse(selected, selected._id);
    }
  }
};
Mousetrap.bind('space', function () {
  var event = arguments[0];
  (event.preventDefault || event.stop || event.stopPropagation || function () {
  }).call(event);
  var selected = d3.select(".selected")[0][0].__data__;
  toggleCollapsedNode(selected);
});


Mousetrap.bind('mod+e', function createXmlFile() {
  var rootNode = d3.selectAll('.node')[0].find(function (node) {
    return !node.__data__.position;
  });
  var rootNodeObject = rootNode.__data__;
  var XMLString = [];
  XMLString = "<map version=\"1.0.1\">\n";

  XMLString = JSONtoXML(XMLString, rootNodeObject);
  XMLString += "</map>";

  window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
  window.requestFileSystem(window.TEMPORARY, 1024 * 1024, function (fs) {

    fs.root.getFile('testmap1.mm', {create: true}, function (fileEntry) {

      fileEntry.createWriter(function (fileWriter) {
        fileWriter.truncate(0);
      }, function () {
      });

      fileEntry.createWriter(function (fileWriter) {
        var blob = new Blob([XMLString]);
        fileWriter.write(blob);
        fileWriter.addEventListener("writeend", function () {
          location.href = fileEntry.toURL();
        }, false);
      }, function () {
      });
    }, function () {
    });
  }, function () {
  });

});

Mousetrap.bind('mod+left', debounce(250, true,
  function () {
    var selection = d3.select(".node.selected")[0][0];
    if (selection) {
      var data = selection.__data__;
      var dir = getDirection(data),
        parent = data.parent,
        selectedNode,
        target,
        direction;

      function pasteAfterCut() {
        if (target.isCollapsed) {
          expandRecursive(target, target._id);
          removeLocally(target._id);
        }
        if (direction == "right")
          selectedNode = paste(data, target, direction, parent);
        else
          selectedNode = paste(data, target, direction);
        retainCollapsed();
        App.selectNode(selectedNode);
      }

      switch (dir) {
        case('right'):
          cut(function () {
            if (getDirection(parent) === 'root') {
              if (data.hasOwnProperty('isCollapsed') && data.isCollapsed)
                removeLocally(data._id);
              selectedNode = paste(data, parent, "left");
              retainCollapsed();
              App.selectNode(selectedNode);
              return;

            }
            else {
              target = parent.parent;
              direction = "right";
              pasteAfterCut();
            }
          });

          break;
        case('root'):
          alert("Root cannot be added to a new parent");
          break;
        case('left'):
          var nl = parent.children || [], i = 0;
          if (parent[dir]) {
            nl = parent[dir];
          }
          var l = nl.length;
          for (; i < l; i++) {
            if (nl[i]._id === data._id && l != 1) {
              if (i === 0)
                target = nl[(i + 1)];
              else
                target = nl[(i - 1)];
              direction = "left";
              cut(pasteAfterCut);
              break;
            }

          }
          break;
        default:
          break;
      }
    }
  }));

Mousetrap.bind('mod+right', debounce(250, true,
  function () {
    var selection = d3.select(".node.selected")[0][0],
      selectedNode,
      target,
      direction;


    if (selection) {
      var data = selection.__data__;
      var dir = getDirection(data),
        parent = data.parent;

      function pasteAfterCut() {
        if (target.isCollapsed) {
          expandRecursive(target, target._id);
          removeLocally(target._id);
        }
        if (direction == "left")
          selectedNode = paste(data, target, direction, parent);
        else
          selectedNode = paste(data, target, direction);
        retainCollapsed();
        App.selectNode(selectedNode);
      }

      switch (dir) {
        case('left'):
          cut(function () {
            if (getDirection(parent) === 'root') {
              if (data.hasOwnProperty('isCollapsed') && data.isCollapsed)
                removeLocally(data._id);
              selectedNode = paste(data, parent, "right");
              retainCollapsed();
              App.selectNode(selectedNode);
              return;
            }
            else {
              target = parent.parent;
              direction = "left";
              pasteAfterCut();
            }
          });

          break;
        case('root'):
          alert("Root cannot be added to a new parent");
          break;
        case('right'):
          var nl = parent.children || [], i = 0;
          if (parent[dir]) {
            nl = parent[dir];
          }
          var l = nl.length;
          for (; i < l; i++) {
            if (nl[i]._id === data._id && l != 1) {
              if (i === 0)
                target = nl[(i + 1)];
              else
                target = nl[(i - 1)];
              direction = "right";
              cut(pasteAfterCut);
              break;
            }
          }
          break;
        default:
          break;
      }

    }
  }));


Mousetrap.bind('mod+up', debounce(250, true,
  function () {
    var selection = d3.select(".node.selected")[0][0].__data__;

    if (!(selection && selection.parent))
      return;

    var previousSibling,
      siblings = selection.parent[selection.position] || selection.parent.children,
      parent = selection.parent;
    if (siblings.length <= 1) return;
    if (selection.previous) {

      if (parent[selection.position]) {
        siblings = parent[selection.position];
      }
      var l = siblings.length;
      if (l == 1)
        return;
      for (var i = 0; i < l; i++) {
        if (siblings[i]._id === selection._id) {
          previousSibling = siblings[i - 1];
          break;
        }
      }
      if (previousSibling.previous) {
        previousSibling = siblings.find(function (x) {
          return x._id == previousSibling.previous
        });
      }
      else {
        App.selectNode(previousSibling);
        cut(function (err, data) {
          paste(previousSibling, selection.parent, selection.position, selection);
          retainCollapsed();
          App.selectNode(selection);
        });
        return;
      }
    } else {

      previousSibling = siblings[siblings.length - 1];
    }
    cut(function (err, data) {
      var selectedNode = paste(selection, selection.parent, selection.position, previousSibling);
      retainCollapsed();
      App.selectNode(selectedNode);
    });
  }));

Mousetrap.bind('mod+down', debounce(250, true,
  function () {
    var selection = d3.select(".node.selected")[0][0].__data__;

    if (!(selection && selection.parent))
      return;

    var nextSibling,
      siblings = selection.parent[selection.position] || selection.parent.children;
    if (siblings.length <= 1) return;
    if (selection.next) {
      nextSibling = siblings.find(function (x) {
        return x._id == selection.next;
      });

    }
    else {
      var newNode = {
        name: selection.name, position: selection.position,
        parent_ids: selection.parent_ids,
        previous: null, next: siblings[0]._id
      };
      cut(function () {
        var headId = siblings[0]._id;
        newNode._id = mindMapService.addNode(newNode);
        if (selection.hasOwnProperty('isCollapsed') && selection.isCollapsed) {
          newNode.isCollapsed = selection.isCollapsed;
          storeLocally(newNode);
        }

        mindMapService.updateNode(headId, {previous: newNode._id});
        var previous = null;
        (selection.children || selection._children || []).forEach(function (child) {
          previous = paste(child, newNode, child.position, previous);
        });

        retainCollapsed();
        App.selectNode(newNode);
      });
      return;
    }

    cut(function () {
      var selectedNode = paste(selection, selection.parent, selection.position, nextSibling);
      retainCollapsed();
      App.selectNode(selectedNode);
    });
  }));


function JSONtoXML(XMLString, nodeObject) {
  XMLString += "<node ";
  XMLString += "ID = \"" + nodeObject._id + "\"";
  XMLString += "TEXT = \"" + nodeObject.name + "\"";

  if (nodeObject.hasOwnProperty('parent_ids') && nodeObject.parent_ids.length === 1) {
    XMLString += "POSITION = \"" + nodeObject.position + "\"";
  }

  XMLString += ">\n";

  (nodeObject.children || nodeObject._children || []).forEach(function (child) {
    XMLString = JSONtoXML(XMLString, child)
  });

  XMLString += "</node>\n";
  return XMLString;
}

Mousetrap.bind("esc", function goToRootNode() {
  App.select(d3.select('.node.level-0')[0][0]);
  getChartInFocus();
});

Mousetrap.bind('?', function showHelp() {
  $('#help-modal').modal('show');
});

calculateDirectionGlobal = calculateDirection;
