var mindMapService = new MindMapService();

var update = function (data) {
  window.data = data;
  d3.select('#mindmap svg')
    .datum(data)
    .call(App.chart);
  App.chart.update();
  App.getChartInFocus();
};

var enableHelpLink = function () {
  $('#help-modal').modal('show');
};

Template.create.rendered = function rendered() {

  var tree = mindMapService.buildTree(this.data.id, this.data.data);
  update(tree);
  var rootNode = d3.selectAll('.node')[0].find(function (node) {
    return !node.__data__.position;
  });

  App.select(rootNode);
  Mindmaps.find().observeChanges(App.tracker);

  App.retainCollapsed();
  d3.select("#help-link").on('click', enableHelpLink);

  App.setMapsCount();
};
