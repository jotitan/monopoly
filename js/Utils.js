/* Fonctions utilitaires */

// Defini la methode size. Cette methode evite d'etre enumere dans les boucles
Object.defineProperty(Array.prototype, "size", {
    value: function () {
        var count = 0;
        for (var i in this) {
            count++;
        }
        return count;
    },
    writable: false,
    enumerable: false,
    configurable: false
});

Object.defineProperty(Array.prototype, "contains", {
    value: function (value) {
        for (var i in this) {
            if (this[i] == value) {
                return true;
            }
        }
        return false;
    },
    writable: false,
    enumerable: false,
    configurable: false
});

Object.defineProperty(Array.prototype, "filter", {
    value: function (callback) {
        var list = [];
        for (var i in this) {
            if (callback(this[i])) {
                list.push(this[i]);
            }
        }
        return list;
    },
    writable: false,
    enumerable: false,
    configurable: false
});

Object.defineProperty(Array.prototype, "some", {
    value: function (callback) {
        for (var i in this) {
            if (callback(this[i])) {
                return true;
            }
        }
        return false;
    },
    writable: false,
    enumerable: false,
    configurable: false
});

$.bind = function (eventName, fct) {
    $('body').bind(eventName, fct);
    return $('body');
}

$.trigger = function (eventName, params) {
    $('body').trigger(eventName, params);
}
