/* Fonctions utilitaires */

// Defini la methode size. Cette methode evite d'etre enumere dans les boucles
Object.defineProperty(Array.prototype, "size", {
    value: function () {
        let count = 0;
        for (let i in this) {
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
        for (let i in this) {
            if (this[i] === value) {
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
        const list = [];
        for (const i in this) {
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
        for (let i in this) {
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