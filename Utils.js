/**
 * @description 在网页上输出
 */
function LOG(x) {
    console.log(x);
    if(typeof x === "object") {
        x = JSON.stringify(x);
    }
    let html = $("#output").html();
    $("#output").html(html + x + `<br>`);
}

// 复数类
class Complex {
    constructor(rep, imp) {
        this.rep = rep;
        this.imp = imp;
    }
    add(c) {
        return new Complex(c.rep + this.rep, c.imp + this.imp);
    }
    sub(c) {
        return new Complex(this.rep - c.rep, this.imp - c.imp);
    }
    scale(r) {
        return new Complex(r * this.rep, r * this.imp);
    }
    mul(c) {
        let newrep = this.rep * c.rep - this.imp * c.imp;
        let newimp = this.rep * c.imp + this.imp * c.rep;
        return new Complex(newrep, newimp);
    }
    copyFrom(c) {
        this.rep = c.rep;
        this.imp = c.imp;
    }
    // 模的平方
    energy() {
        return (this.rep * this.rep + this.imp * this.imp);
    }
    // 模
    radius() {
        return Math.sqrt(this.rep * this.rep + this.imp * this.imp);
    }
    // 相位([0, 2*pi))
    phase() {
        let angle = Math.atan2(this.imp, this.rep);
        return (angle >= 0) ? angle : (2 * Math.PI + angle);
    }
    show() {
        LOG('Complex:[ ' + this.rep + ' , ' + this.imp + ' ]');
    }
}

// 实数数组 转 复数数组
function RealArrayToComplexArray(realArray) {
    let complexArray = new Array();
    for(let i = 0; i < realArray.length; i++) {
        complexArray.push(new Complex(realArray[i], 0));
    }
    return complexArray;
}

// 复数数组 转换成 两个 实数数组，分别是实部和虚部
function ComplexArrayToRealArrays(complexArray) {
    let repArray = new Array();
    let impArray = new Array();
    for(let i = 0; i < complexArray.length; i++) {
        repArray.push(complexArray[i].rep);
        impArray.push(complexArray[i].imp);
    }
    return [repArray, impArray];
}

// 复数数组 转换成 两个 实数数组，分别是模和相位
function ComplexArrayToPolarArrays(complexArray) {
    let radiusArray = new Array();
    let phaseArray = new Array();
    for(let i = 0; i < complexArray.length; i++) {
        radiusArray.push(complexArray[i].radius());
        phaseArray.push(complexArray[i].phase());
    }
    return [radiusArray, phaseArray];
}

// 指数查找表
const POW2 = [1,2,4,8,16,32,64,128,256,512,1024,2048,4096,8192,16384,32768,65536];

// 对数查找表
const LOG2 = {
    '1':0,      '2':1,      '4':2,      '8':3,      '16':4,      '32':5,      '64':6,      '128':7,      '256':8,
    '512':9,    '1024':10,  '2048':11,  '4096':12,  '8192':13,   '16384':14,  '32768':15,  '65536':16,
};


/**
 * @description 返回某正整数的指定长度的二进制串
 */
function BinaryString(intNumber, length) {
    if(intNumber > ((1 << length) - 1)) throw "range error"; // TODO 供测试
    let seq = [];
    for(let i = 0; i < length; i++) {
        if((intNumber & 1) > 0) seq.unshift("1");
        else seq.unshift("0");
        intNumber = intNumber >> 1;
    }
    return seq.join("");
}

/**
 * @description 二进制串转无符号整数
 */
function BinaryStringToUint(bstr) {
    let sum = 0;
    for(let i = bstr.length; i>= 0; i--) {
        if(bstr[i] === "1") {
            sum += (1 << (bstr.length - i - 1));
        }
    }
    return sum;
}
