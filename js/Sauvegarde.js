/* Gestion de la sauvegarde */
var Sauvegarde = {
    prefix: "monopoly.",
    suffix: ".save",
	currentSauvegardeName:null,
	isSauvegarde:function(){
		return currentSauvegardeName!=null;
	},
    save: function (name) {
		this.currentSauvegardeName = name !=null ? this.getSauvegardeName(name) : this.currentSauvegardeName || this.getSauvegardeName();
        // On recupere la liste des joueurs
        var saveJoueurs = [];
		GestionJoueur.forEach(function(j){if(j.save){saveJoueurs.push(j.save())}});
        /*for (var j in joueurs) {
            if (joueurs[j].save != null) {
                saveJoueurs.push(joueurs[j].save());
                // On retient la position du joueur
            }
        }*/
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
            nbTours: nbTours,
			plateau:currentPlateauName
        };
        this._putStorage(this.currentSauvegardeName, data);
        $.trigger("monopoly.save", {
            name: this.currentSauvegardeName
        });
    },
    load: function (name) {
        this.currentSauvegardeName = name;
        var data = this._getStorage(name);
        reset();
		// On charge le plateau
		InitMonopoly.plateau.load(data.plateau || "data-monopoly.json",function(){
			data.joueurs.forEach(function(j){GestionJoueur.createAndLoad(!j.canPlay, i,j.nom,j);});
			/*for (var i = 0; i < data.joueurs.length; i++) {
				GestionJoueur.createAndLoad(!data.joueurs[i].canPlay, i,data.joueurs[i].nom,data.joueurs[i]);
			}*/
			data.fiches.forEach(function(f){GestionFiche.getById(f.id).load(f);});
			/*for (var i = 0; i < data.fiches.length; i++) {
				GestionFiche.getById(data.fiches[i].id).load(data.fiches[i]);
			}*/
			$.trigger('refreshPlateau');
			VARIANTES = data.variantes || VARIANTES;
			nbTours = data.nbTours || 0;
			InitMonopoly.afterCreateGame();			
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
        return this.prefix + ((name == null) ? new Date().getTime() : name) + this.suffix;
    }
}