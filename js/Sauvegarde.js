/* Gere la sauvegarde. */
/* TODO : rendre independant du jeu */
var Sauvegarde = {
    prefix: "monopoly.",
    suffix: ".save",
	/* Permet la sauvegarde de la partie */
	/* TODO : passer en parametre les donnees : {joueurs,fiches,joueurCourant,variantes} */
    save: function (name,datas) {
        if (name == null) {
            name = this.getSauvegardeName();
        }
        // On recupere la liste des joueurs
        var saveJoueurs = [];
        for (var j in datas.joueurs) {
            if (datas.joueurs[j].save != null) {
                saveJoueurs.push(datas.joueurs[j].save());
                // On retient la position du joueur
            }
        }
        // On recupere la liste des fiches
        var saveFiches = [];
        for (var f in datas.fiches) {
            if (datas.fiches[f].save != null) {
                saveFiches.push(datas.fiches[f].save());
            }
        }
        var data = {
            joueurs: saveJoueurs,
            fiches: saveFiches,
            joueurCourant: datas.joueurCourant.id,
            variantes: datas.variantes
        };
        this._putStorage(name, data);
        $.trigger("monopoly.save", {
            name: name
        });
    },
    load: function (name) {
        currentSauvegardeName = name;
        var data = this._getStorage(name);
        reset();
        for (var i = 0; i < data.joueurs.length; i++) {
            var joueur = createJoueur(data.joueurs[i].robot, i);
            joueur.load(data.joueurs[i]);
            joueurs.push(joueur);
        }
        for (var i = 0; i < data.fiches.length; i++) {
            fiches[data.fiches[i].id].load(data.fiches[i]);
        }
        var joueur = joueurs[0];
        if (data.joueurCourant != null) {
            joueur = getJoueurById(data.joueurCourant);
        }
        VARIANTES = data.variantes || VARIANTES;
        selectJoueur(joueur);
        initToolTipJoueur();
    },
    delete: function (name) {
        localStorage.removeItem(name);
    },
    _putStorage: function (name, data) {
        localStorage[name] = JSON.stringify(data);
    },
    _getStorage: function (name) {
        if (localStorage[name] == null) {
            throw "Aucune sauvegarde";
        }
        var data = localStorage[name];
        return JSON.parse(data);
    },
    autoSave: function () {

    },
    findSauvegardes: function () {
        var exp = "^" + this.prefix + "(.*)" + this.suffix + "$";
        var list = [];
        for (var name in localStorage) {
            var label = new RegExp(exp, "g").exec(name);
            if (label != null) {
                list.push({
                    value: name,
                    label: label[1]
                });
            }
        }
        return list;
    },
    getSauvegardeName: function (name) {
        return this.prefix + ((name == null) ? new Date().getTime() : name) + this.suffix;
    }

}