/* Gestion de la sauvegarde */
var Sauvegarde = {
    prefix: "monopoly.",
    suffix: ".save",
    currentSauvegardeName:null,
    isSauvegarde:function(){
        return this.currentSauvegardeName!=null;
    },
    save: function (name, namePlateau) {
        this.currentSauvegardeName = name !=null ? this.getSauvegardeName(name) : this.currentSauvegardeName || this.getSauvegardeName();
        // On recupere la liste des joueurs
        var saveJoueurs = [];
        GestionJoueur.forEach(function(j){if(j.save){saveJoueurs.push(j.save())}});
        // On recupere la liste des fiches
        var saveFiches = [];
        var it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            saveFiches.push(it.next().save());
        }
        var data = {
            joueurs: saveJoueurs,
            fiches: saveFiches,
            joueurCourant: GestionJoueur.getJoueurCourant().id,
            variantes: VARIANTES,
            nbTours: globalStats.nbTours,
            plateau:namePlateau
        };
        this._putStorage(this.currentSauvegardeName, data);
        $.trigger("monopoly.save", {
            name: this.currentSauvegardeName
        });
    },
    load: function (name, monopoly) {
        this.currentSauvegardeName = name;
        let data = this._getStorage(name);
        // On charge le plateau
        VARIANTES = data.variantes || VARIANTES;
        monopoly.plateau.load(data.plateau || "data-monopoly.json",{},function(){
            data.joueurs.forEach((j,i)=>GestionJoueur.createAndLoad(!j.canPlay, i,j.nom,j,monopoly.plateau.infos.montantDepart));
            data.fiches.forEach(f=>GestionFiche.getById(f.id).load(f));
            $.trigger('refreshPlateau');
            globalStats.nbTours = data.nbTours || 0;
            monopoly.afterCreateGame();
            GestionJoueur.change(data.joueurCourant);
        });
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
        return this.prefix + ((name == null || name === "") ? new Date().getTime() : name) + this.suffix;
    }
}