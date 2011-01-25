/**
 * View: ExportJobListView
 *
 * Shows a list of current export jobs from an ExportJobList collection in a
 * sidebar drawer.
 */
var ExportJobListView = DrawerView.extend({
    initialize: function() {
        this.options.title = 'Exports';
        this.options.content = ich.ExportJobListView({}, true);
        this.bind('render', this.renderJobs);
        DrawerView.prototype.initialize.call(this);
    },
    renderJobs: function() {
        var that = this;
        this.collection.fetch({
            success: function() {
                that.collection.each(function(job) {
                    if (!job.view) {
                        job.view = new ExportJobRowView({ model: job });
                        $('.jobs', that.el).append(job.view.el);
                    }
                });
            }
        });
    }
});

/**
 * View: ExportJobRowView
 *
 * A single job row in an ExportJobListView.
 */
var ExportJobRowView = Backbone.View.extend({
    tagName: 'li',
    className: 'clearfix',
    events: {
        'click a.delete': 'destroy'
    },
    initialize: function() {
        _.bindAll(this, 'render', 'destroy', 'update');
        this.render();

        // If this model has not been processed, add a watcher to update its status.
        if (this.model.get('status') !== 'complete' && this.model.get('status') !== 'error') {
            this.watcher = new Watcher(this.model, this.update, 5000);
        }
    },
    update: function() {
        // Remove watcher when complete.
        if (this.model.get('status') === 'complete' || this.model.get('status') === 'error') {
            this.watcher.destroy();
        }
        this.render();
    },
    render: function() {
        $(this.el).html(ich.ExportJobRowView({
            time: this.model.time(),
            progress: parseInt(this.model.get('progress') * 100),
            progressClass: parseInt(this.model.get('progress') * 10),
            filename: this.model.get('filename'),
            status: this.model.get('status'),
            error: this.model.get('error'),
            type: this.model.get('type'),
            download: this.model.downloadURL()
        }));
    },
    destroy: function() {
        var that = this;
        if (confirm('Are you sure you want to delete this export?')) {
            this.model.destroy({
                success: function() {
                    that.remove();
                },
                error: function() {
                    window.app.message('Error', 'The job could not be deleted.');
                }
            });
        }
        return false;
    }
});

var ExportJobDropdownView = DropdownView.extend({
    initialize: function() {
        _.bindAll(this, 'export', 'jobs');
        this.options.title = 'Export';
        this.options.content = ich.ExportJobOptions({}, true);
        this.render();
    },
    events: _.extend({
        'click a.export-option': 'xport',
        'click a.jobs': 'jobs'
    }, DropdownView.prototype.events),
    xport: function(event) {
        this.options.map.xport($(event.currentTarget).attr('href').split('#').pop(), this.model);
        this.toggleContent();
        return false;
    },
    jobs: function(event) {
        new ExportJobListView({ collection: new ExportJobList });
        this.toggleContent();
        return false;
    }
});

var ExportJobView = Backbone.View.extend({
    render: function() {
        $(this.el).html(ich.ExportJobView(this.options));
        $('.palette', this.el).append(this.getFields());
        window.app.el.append(this.el);
        return this;
    },
    initialize: function() {
        _.bindAll(this, 'boundingBoxAdded', 'boundingBoxReset', 'updateUI');
        this.model.bind('change', this.updateUI);

        $('body').addClass('exporting');
        this.options.map.maximize();
        this.render();
        var boundingBox = this.options.map.map.getExtent().toArray();
        this.model.set({ bbox: boundingBox.join(',') });

        this.boxDrawingLayer = new OpenLayers.Layer.Vector('Temporary Box Layer');
        this.boxDrawingControl = new ExportCropControl(this.boxDrawingLayer, {
            featureAdded: this.boundingBoxAdded,
            bounds: boundingBox
        });
        this.options.map.map.addLayer(this.boxDrawingLayer);
        this.options.map.map.addControl(this.boxDrawingControl);
        this.boxDrawingControl.activate();
    },
    boundingBoxAdded: function(box) {
        var bounds = box.geometry.components[1].getBounds().toArray();
        this.model.set({ bbox: bounds.join(',') });
    },
    boundingBoxReset: function() {
        this.model.set({ bbox: [-20037500, -20037500, 20037500, 20037500].join(',') });
        this.boxDrawingControl.drawFeature(this.model.get('bbox').split(','));
        return false;
    },
    events: _.extend({
        'click a.reset': 'boundingBoxReset',
        'click input.submit': 'submit',
        'change input': 'changeValue',
        'change select': 'changeValue'
    }, PopupView.prototype.events),
    changeValue: function(event) {
        var data = {};
        if ($(event.target).is('.bbox')) {
            var bbox = [
                parseFloat(this.$('#bbox-w').val()),
                parseFloat(this.$('#bbox-s').val()),
                parseFloat(this.$('#bbox-e').val()),
                parseFloat(this.$('#bbox-n').val())
            ];
            var nw = OpenLayers.Projection.transform(
                { x: bbox[0], y: bbox[3] },
                new OpenLayers.Projection('EPSG:4326'),
                new OpenLayers.Projection('EPSG:900913')
            );
            var se = OpenLayers.Projection.transform(
                { x: bbox[2], y: bbox[1] },
                new OpenLayers.Projection('EPSG:4326'),
                new OpenLayers.Projection('EPSG:900913')
            );
            data.bbox = [ nw.x, se.y, se.x, nw.y ].join(',');
        }
        else {
            data[$(event.target).attr('id')] = $(event.target).val();
        }
        this.model.set(data);
        this.boxDrawingControl.drawFeature(this.model.get('bbox').split(','));
    },
    updateUI: function(model) {
        var that = this;
        _.each(model.changedAttributes(), function(value, key) {
            if (key === 'bbox') {
                var bbox = value.split(',');
                var nw = OpenLayers.Projection.transform(
                    { x: bbox[0], y: bbox[3] },
                    new OpenLayers.Projection('EPSG:900913'),
                    new OpenLayers.Projection('EPSG:4326')
                );
                var se = OpenLayers.Projection.transform(
                    { x: bbox[2], y: bbox[1] },
                    new OpenLayers.Projection('EPSG:900913'),
                    new OpenLayers.Projection('EPSG:4326')
                );
                that.$('#bbox-w').val(nw.x);
                that.$('#bbox-s').val(se.y);
                that.$('#bbox-e').val(se.x);
                that.$('#bbox-n').val(nw.y);
            }
            else {
                that.$('#' + key).val(value);
            }
        });
    },
    submit: function() {
        this.options.collection.add(this.model);
        this.model.save();
        this.close();
        new ExportJobListView({ collection: new ExportJobList });
        return false;
    },
    close: function() {
        this.boxDrawingControl.deactivate();
        this.options.map.map.removeControl(this.boxDrawingControl);
        this.options.map.map.removeLayer(this.boxDrawingLayer);
        $('body').removeClass('exporting');
        this.options.map.minimize();
        PopupView.prototype.close.call(this);
        return false;
    },
});

var ExportJobImageView = ExportJobView.extend({
    initialize: function() {
        _.bindAll(this, 'updateUI');
        this.options.title = 'Export PNG';
        this.options.type = 'ExportJobImage';
        ExportJobView.prototype.initialize.call(this);
    },
    render: function() {
        ExportJobView.prototype.render.call(this);
        var size = this.options.map.map.getSize();
        var data = {
            filename: this.options.project.get('id') + '.png',
            width: size.w,
            height: size.h,
            aspect: size.w / size.h
        }
        this.model.set(data);
        this.model.bind('change:width', this.updateDimensions);
        this.model.bind('change:height', this.updateDimensions);
        this.model.bind('change:aspect', this.updateDimensions);
    },
    getFields: function() {
        return ich.ExportJobImageView(this.options);
    },
    boundingBoxAdded: function(box) {
        ExportJobView.prototype.boundingBoxAdded.call(this, box);
        var bounds = box.geometry.components[1].getBounds();
        this.model.set({aspect: bounds.getWidth() / bounds.getHeight()});
    },
    updateDimensions: function(model) {
        var attributes = model.changedAttributes();
        if (attributes.width) {
            model.set({
                height: Math.round(attributes.width / model.get('aspect'))},
                {silent: true}
            );
        }
        else if (attributes.height) {
            model.set({
                width: Math.round(model.get('aspect') * attributes.height)},
                {silent: true}
            );
        }
        else if (attributes.aspect) {
            model.set({
                height: Math.round(model.get('width') / attributes.aspect)},
                {silent: true}
            );
        }
    }
});

var ExportJobMBTilesView = ExportJobView.extend({
    initialize: function() {
        _.bindAll(this, 'changeZoomLevels', 'updateZoomLabels');
        this.options.title = 'Export MBTiles';
        this.options.type = 'ExportJobMBTiles';
        this.options.filename = this.options.project.get('id') + '.mbtiles';

        // Set default values.
        this.model.set({
            filename: this.options.project.get('id') + '.mbtiles',
            minzoom: 0,
            maxzoom: 8,
            metadata_name: this.options.project.get('id'),
            metadata_description: '',
            metadata_version: '1.0.0',
            metadata_type: 'baselayer'
        });

        ExportJobView.prototype.initialize.call(this);
    },
    render: function() {
        ExportJobView.prototype.render.call(this);
        var slider = this.$('#mbtiles-zoom').slider({
            range: true,
            min:0,
            max:22,
            step:1,
            values: [
                this.model.get('minzoom'),
                this.model.get('maxzoom')
            ],
            slide: this.changeZoomLevels
        });
        this.model.bind('change:minzoom', this.updateZoomLabels);
        this.model.bind('change:maxzoom', this.updateZoomLabels);
    },
    getFields: function() {
        return ich.ExportJobMBTilesView({
            minzoom: this.model.get('minzoom'),
            maxzoom: this.model.get('maxzoom'),
            metadata_name: this.model.get('metadata_name'),
            metadata_description: this.model.get('metadata_description'),
            metadata_version: this.model.get('metadata_version'),
            metadata_type_baselayer: this.model.get('metadata_type') === 'baselayer',
        });
    },
    changeZoomLevels: function(event, ui) {
        this.model.set({
            minzoom: ui.values[0],
            maxzoom: ui.values[1]
        });
    },
    updateZoomLabels: function() {
        this.$('span.min-zoom').text(this.model.get('minzoom'));
        this.$('span.max-zoom').text(this.model.get('maxzoom'));
    }
});

/**
 * @TODO: This code is out of date (based on previous XYZ tile URLs).
 * Update for TMS layer format.
 */
var ExportJobEmbedView = PopupView.extend({
    initialize: function(options) {
        this.options.title = 'Embed';
        this.options.content = ich.ExportJobEmbedView({
            tile_url: this.options.project.layerURL({signed: true}),
        }, true);
        PopupView.prototype.initialize.call(this, options);
    }
});

var exportMethods = {
    ExportJobImage: ExportJobImageView,
    ExportJobMBTiles: ExportJobMBTilesView,
    ExportJobEmbed: ExportJobEmbedView
};

/**
 * Custom OpenLayers control for generating a masked crop box over the map.
 * Assumes 900913 projection for extent of masked area.
 */
var ExportCropControl = OpenLayers.Class(OpenLayers.Control, {
    CLASS_NAME: 'ExportCropControl',
    EVENT_TYPES: ['featureadded'],

    layer: null,
    canvas: null,
    feature: null,
    callbacks: null,
    multi: false,
    featureAdded: function() {},
    handlerOptions: null,

    initialize: function(layer, options) {
        // concatenate events specific to vector with those from the base
        this.EVENT_TYPES =
            OpenLayers.Control.DrawFeature.prototype.EVENT_TYPES.concat(
            OpenLayers.Control.prototype.EVENT_TYPES
        );
        OpenLayers.Control.prototype.initialize.apply(this, [options]);
        this.callbacks = OpenLayers.Util.extend(
            { done: this.drawFeature },
            this.callbacks
        );
        this.layer = layer;

        // Set handler style and options.
        this.handlerOptions = this.handlerOptions || {
            'keyMask': OpenLayers.Handler.MOD_SHIFT,
            'sides': 4,
            'irregular': true
        };
        var style = OpenLayers.Util.extend(OpenLayers.Feature.Vector.style['default'], {
            fillColor: '#000',
            fillOpacity: 0.5,
            strokeWidth: 0
        });
        this.handlerOptions.layerOptions = OpenLayers.Util.applyDefaults(
            this.handlerOptions.layerOptions,
            {styleMap: new OpenLayers.StyleMap({"default": style})}
        );
        this.handler = new OpenLayers.Handler.RegularPolygon(this, this.callbacks, this.handlerOptions);

        // Draw initial handler.
        var bounds = options.bounds || [-10000000, -10000000, 10000000, 10000000];
        this.canvas = new OpenLayers.Geometry.LinearRing([
            new OpenLayers.Geometry.Point(-20037500, 20037500),
            new OpenLayers.Geometry.Point(20037500, 20037500),
            new OpenLayers.Geometry.Point(20037500, -20037500),
            new OpenLayers.Geometry.Point(-20037500, -20037500)
        ]);
        this.feature = new OpenLayers.Feature.Vector(
            new OpenLayers.Geometry.Polygon([
                this.canvas,
                new OpenLayers.Geometry.LinearRing([
                    new OpenLayers.Geometry.Point(bounds[0], bounds[3]),
                    new OpenLayers.Geometry.Point(bounds[2], bounds[3]),
                    new OpenLayers.Geometry.Point(bounds[2], bounds[1]),
                    new OpenLayers.Geometry.Point(bounds[0], bounds[1])
                ])
            ])
        );
        this.feature.state = OpenLayers.State.INSERT;
        layer.addFeatures([this.feature]);
    },

    drawFeature: function(geometry) {
        if (geometry.components) {
            var feature = new OpenLayers.Feature.Vector(
                new OpenLayers.Geometry.Polygon([
                    this.canvas,
                    geometry.components.pop()
                ])
            );
        }
        // Allow a straight bbox to be passed in.
        else if (geometry.length === 4) {
            var feature = new OpenLayers.Feature.Vector(
                new OpenLayers.Geometry.Polygon([
                    this.canvas,
                    new OpenLayers.Geometry.LinearRing([
                        new OpenLayers.Geometry.Point(geometry[0], geometry[3]),
                        new OpenLayers.Geometry.Point(geometry[2], geometry[3]),
                        new OpenLayers.Geometry.Point(geometry[2], geometry[1]),
                        new OpenLayers.Geometry.Point(geometry[0], geometry[1])
                    ])
                ])
            );
        }

        var proceed = this.layer.events.triggerEvent(
            "sketchcomplete", {feature: feature}
        );
        if(proceed !== false) {
            feature.state = OpenLayers.State.INSERT;

            // Replace this.feature with the new feature.
            this.feature.destroy();
            this.feature = feature;
            this.layer.addFeatures([feature]);
            this.featureAdded(feature);
            this.events.triggerEvent("featureadded", { feature : feature });
        }
    }
});

