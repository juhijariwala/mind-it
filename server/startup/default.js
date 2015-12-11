mindMapService = new MindMapService();
Meteor.publish('mindmap', function (id) {
	return Mindmaps.find({$or: [{_id: id}, {parent_ids: id}]});
});
Meteor.methods({
	deleteNode: function(id){
		//Meteor._sleepForMs(500);
		mindMapService.deleteNode(id);
	}
});