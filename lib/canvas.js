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
    Reset: function () {
        this.canvas.width = this.canvas.width;
        this.canvas.height = this.canvas.height;
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
    // 重新设定画布的坐标（典型场景为根据幅度值自适应的坐标轴范围）
    Resize: function (bottomLeft, topRight, width, height) {
        this.Xmin = bottomLeft[0];
        this.Xmax = topRight[0];
        this.Xrange = this.Xmax - this.Xmin;
        this.Ymin = bottomLeft[1];
        this.Ymax = topRight[1];
        this.Yrange = this.Ymax - this.Ymin;
        let newWidth = width || (this.Xrange);
        let newHeight = height || (this.Yrange);
        this.canvas.setAttribute("width", `${newWidth}px`);
        this.canvas.setAttribute("height", `${newHeight}px`);
    },
    Clear: function () {
        // this.canvas.height = this.canvas.height;
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
    Text: function (text, position, fillStyle, font, textAlign) {
        this.context.fillStyle = fillStyle || "#000";
        this.context.font = font || "14px serif";
        this.context.textAlign = textAlign || "left";
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
    // 提取Canvas上的RGB图像
    ReadRGB: function () {
        var width = this.canvas.width;
        var height = this.canvas.height;
        var imageData = this.context.getImageData(0, 0, width, height);
        var R = new Matrix(width, height);
        var G = new Matrix(width, height);
        var B = new Matrix(width, height);
        for (var i = 0; i < width * height; i++) {
            R.data[i] = (imageData.data)[(i << 2)];
            G.data[i] = (imageData.data)[(i << 2) + 1];
            B.data[i] = (imageData.data)[(i << 2) + 2];
        }
        return { R: R, G: G, B: B };
    },
    // 绘制RGB格式的图像
    DrawRGB: function (RGB) {
        var data = new Uint8ClampedArray(RGB.R.width * RGB.R.height * 4);
        for (var i = 0; i < RGB.R.width * RGB.R.height; i++) {
            data[(i << 2)] = PAImage.clamp(RGB.R.data[i]);
            data[(i << 2) + 1] = PAImage.clamp(RGB.G.data[i]);
            data[(i << 2) + 2] = PAImage.clamp(RGB.B.data[i]);
            data[(i << 2) + 3] = PAImage.MaxValue;
        }
        var newImage = new ImageData(data, RGB.R.width, RGB.R.height);
        this.context.putImageData(newImage, 0, 0);
    },
    // 将Canvas上的RGB图像转换成YUV（YCbCr）格式的
    ReadYUV420: function () {
        var width = this.canvas.width;
        var height = this.canvas.height;
        var imageData = this.context.getImageData(0, 0, width, height);
        var Y = new Matrix(width, height);
        var U = new Matrix((width >> 1), (height >> 1));
        var V = new Matrix((width >> 1), (height >> 1));
        var UVCount = 0;
        for (var i = 0; i < width * height; i++) {
            var R = (imageData.data)[(i << 2)];
            var G = (imageData.data)[(i << 2) + 1];
            var B = (imageData.data)[(i << 2) + 2];
            Y.data[i] = PAImage.RGBtoY(R, G, B);
            // YUV420
            if ((i & 1) === 0 && (Math.floor(i / width) & 1) === 0) {
                U.data[UVCount] = PAImage.RGBtoU(R, G, B);
                V.data[UVCount] = PAImage.RGBtoV(R, G, B);
                UVCount++;
            }
        }
        return { Y: Y, U: U, V: V };
    },
    // 绘制YUV格式的图像
    DrawYUV420: function (YUV) {
        var data = new Uint8ClampedArray(YUV.Y.width * YUV.Y.height * 4);
        for (var i = 0; i < YUV.Y.width * YUV.Y.height; i++) {
            var Y = YUV.Y.data[i];
            //YUV420
            var row = Math.floor(i / YUV.Y.width);
            var col = i % YUV.Y.width;
            var U = YUV.U.data[(row >> 1) * (YUV.Y.width >> 1) + (col >> 1)];
            var V = YUV.V.data[(row >> 1) * (YUV.Y.width >> 1) + (col >> 1)];
            data[(i << 2)] = PAImage.clamp(PAImage.YUVtoR(Y, U, V));
            data[(i << 2) + 1] = PAImage.clamp(PAImage.YUVtoG(Y, U, V));
            data[(i << 2) + 2] = PAImage.clamp(PAImage.YUVtoB(Y, U, V));
            data[(i << 2) + 3] = PAImage.MaxValue;
        }
        var newImage = new ImageData(data, YUV.Y.width, YUV.Y.height);
        this.context.putImageData(newImage, 0, 0);
    }
};
