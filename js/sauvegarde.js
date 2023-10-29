/* Gestion de la sauvegarde */
import {GestionJoueur} from "./core/gestion_joueurs.js";
import {GestionFiche} from "./display/case_jeu.js";
import {VARIANTES, globalStats, updateVariantes} from "./core/monopoly.js";
import {bus} from "./bus_message.js";
import {deepCopy} from "./utils.js";

let Sauvegarde = {
    prefix: "monopoly.",
    suffix: ".save",
    currentSauvegardeName:null,
    isSauvegarde:function(){
        return this.currentSauvegardeName!=null;
    },
    save: function (name, plateau) {
        this.currentSauvegardeName = name !=null ? this.getSauvegardeName(name) : this.currentSauvegardeName || this.getSauvegardeName();
        this.saveWithName(this.currentSauvegardeName,plateau);
        bus.send('monopoly.save',{name: this.currentSauvegardeName});
    },
    saveWithName: function (saveName, plateau) {
        // On recupere la liste des joueurs
        let saveJoueurs = [];
        GestionJoueur.joueurs.filter(j=>j.saver).forEach(j=>saveJoueurs.push(j.saver.save()));
        // On recupere la liste des fiches
        let saveFiches = [];
        let it = GestionFiche.iteratorTerrains();
        while (it.hasNext()) {
            saveFiches.push(it.next().save());
        }
        let data = {
            joueurs: saveJoueurs,
            fiches: saveFiches,
            joueurCourant: GestionJoueur.getJoueurCourant() != null ? GestionJoueur.getJoueurCourant().id:'',
            variantes: VARIANTES,
            options:plateau.options,
            nbTours: globalStats.nbTours,
            plateau:plateau.name
        };
        this._putStorage(saveName, data);
    },
    load: function (name, monopoly) {
        this.currentSauvegardeName = name;
        let data = this._getStorage(name);
        // On charge le plateau
        updateVariantes(deepCopy(VARIANTES, data.variantes));
        //$.extend(VARIANTES,VARIANTES,data.variantes)
        //VARIANTES = data.variantes || VARIANTES;
        monopoly.plateau.load(data.plateau || "data-monopoly.json",data.options,function(){
            data.joueurs.forEach((j,i)=>GestionJoueur.createAndLoad(!j.canPlay, i,j.nom,j,monopoly.plateau.infos.montantDepart));
            data.fiches.forEach(f=>GestionFiche.getById(f.id).load(f));
            bus.refresh();
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
        const data = localStorage[name];
        return JSON.parse(data);
    },
    autoSave: function () {

    },
    findSauvegardes: function () {
        let exp = "^" + this.prefix + "(.*)" + this.suffix + "$";
        let list = [];
        for (let name in localStorage) {
            let label = new RegExp(exp, "g").exec(name);
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
};



export {Sauvegarde};
