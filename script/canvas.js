function Canvas(cvElementId, bottomLeft, topRight) {
    this.canvas = document.getElementById(cvElementId);
    this.context = this.canvas.getContext('2d');
    this.Xmin = bottomLeft[0];
    this.Xmax = topRight[0];
    this.Xrange = this.Xmax - this.Xmin;
    this.Ymin = bottomLeft[1];
    this.Ymax = topRight[1];
    this.Yrange = this.Ymax - this.Ymin;
    this.RATIO = 1;
    this.Init();
}
Canvas.prototype = {
    Init: function () {
        function adaptRatio(context) {
            var devicePixelRatio = window.devicePixelRatio || 1;
            var backingStoreRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio || context.backingStorePixelRatio || 1;
            return devicePixelRatio / backingStoreRatio;
        }
        this.RATIO = adaptRatio(this.context);
        this.canvas.width = this.canvas.width * this.RATIO;
        this.canvas.height = this.canvas.height * this.RATIO;
    },
    toCanvasX: function (x) {
        return (x - this.Xmin) * this.canvas.width / this.Xrange;
    },
    toCanvasY: function (y) {
        return (this.Ymax - y) * this.canvas.height / this.Yrange;
    },
    toViewX: function (x) {
        return (x * this.RATIO * this.Xrange) / this.canvas.width + this.Xmin;
    },
    toViewY: function (y) {
        return this.Ymax - (y * this.RATIO * this.Yrange) / this.canvas.height;
    },
    Clear: function () {
        this.canvas.height = this.canvas.height;
    },
    SetBackgroundColor: function (color) {
        this.context.fillStyle = color;
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
    },
    Plot: function (point, color) {
        this.context.fillStyle = color;
        this.context.fillRect(this.toCanvasX(point[0]), this.toCanvasY(point[1]), this.canvas.width / this.Xrange, this.canvas.height / this.Yrange);
    },
    Rect: function (point, width, height, color) {
        this.context.fillStyle = color;
        this.context.fillRect(this.toCanvasX(point[0]), this.toCanvasY(point[1]), width * this.canvas.width / this.Xrange, height * this.canvas.height / this.Yrange);
    },
    Circle: function (center, radius, color) {
        this.context.strokeStyle = color;
        this.context.beginPath();
        this.context.arc(this.toCanvasX(center[0]), this.toCanvasY(center[1]), radius * this.canvas.width / this.Xrange, 0, 2 * Math.PI);
        this.context.stroke();
    },
    Line: function (p0, p1, color) {
        this.context.strokeStyle = color;
        this.context.beginPath();
        this.context.moveTo(this.toCanvasX(p0[0]), this.toCanvasY(p0[1]));
        this.context.lineTo(this.toCanvasX(p1[0]), this.toCanvasY(p1[1]));
        this.context.stroke();
    },
    Text: function (text, position) {
        this.context.fillText(text.toString(), this.toCanvasX(position[0]), this.toCanvasY(position[1]));
    },
    AddClickHandler: function (f) {
        var Self = this;
        this.canvas.addEventListener("click", function (event) {
            var x = event.clientX - Self.canvas.getBoundingClientRect().left;
            var y = event.clientY - Self.canvas.getBoundingClientRect().top;
            f([Self.toViewX(x), Self.toViewY(y)]);
        });
    },

};
