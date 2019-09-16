/* Gere les reserves de constructions (maison / hotel) */
var GestionConstructions = {
    nbInitHouse: 32,
    nbInitHotel: 12,
    nbSellHouse: 0,
    nbSellHotel: 0,
    reset: function () {
        this.nbInitHouse = 32;
        this.nbInitHotel = 12;
        this.nbSellHouse = 0;
        this.nbSellHotel = 0;
    },
    isFreeHouse: function () {
        return this.nbInitHouse > this.nbSellHouse;
    },
    isFreeHotel: function (nbActualHouse) {
        if (nbActualHouse == null) {
            return this.nbInitHotel > this.nbSellHotel;
        }
        var needHouse = 4 - nbActualHouse;
        return this.nbInitHotel > this.nbSellHotel & this.nbInitHouse >= this.nbSellHouse + needHouse;
    },
    getRestHouse: function () {
        return this.nbInitHouse - this.nbSellHouse;
    },
    getRestHotel: function () {
        return this.nbInitHotel - this.nbSellHotel;
    },
	sellHotel:function(){
		this.nbSellHotel--;
	},
	sellHouse:function(){
		this.nbSellHouse--;
	},
    buyHouse: function () {
        if (!this.isFreeHouse()) {
            throw "Impossible d'acheter une maison."
        }
        this.nbSellHouse++;
    },
    buyHouses: function (nb) {
        if (nb > this.getRestHouse()) {
            throw "Impossible d'acheter les maisons."
        }
        this.nbSellHouse += nb;
    },
    /* Achete / vend le nombre d'hotels indiques (verification simple sur le nombre d'hotel) */
    buyHotels: function (nb) {
        if (nb > this.getRestHotel()) {
            throw "Impossible d'acheter les hotels."
        }
        this.nbSellHotel += nb;
    },
    buyHotel: function () {
        if (!this.isFreeHouse()) {
            throw "Impossible d'acheter un hotel."
        }
        this.nbSellHotel++;
        // On libere les maisons liees (4)
        this.nbSellHouse -= 4;
    },
    /* Calcule les restes finaux en maison / hotel. Renvoie egalement le delta */
    // On calcule en premier les ventes de maisons
    // On calcule les achats d'hotels (qui necessitent des maisons puis des hotels)
    // Pour finir, on calcule l'achat de maison
    // Chaque projet contient la couleur du groupe, le from (nb, type) et le to (nb, type)
    simulateBuy: function (projects) {
        // Projects est un tableau de from:{type,nb},to:{type,nb}
        var simulation = {
            achat: {
                maison: 0,
                hotel: 0
            },
            reste: {
                maison: this.nbInitHouse - this.nbSellHouse,
                hotel: this.nbInitHotel - this.nbSellHotel
            }
        };

        var actions = {
            venteMaison: function (p, simulation) {
                if (p.from.type == "maison" && p.to.type == "maison" && p.from.nb > p.to.nb) {
                    var nb = p.from.nb - p.to.nb;
                    simulation.achat.maison -= nb;
                    simulation.reste.maison += nb;
                    p.done = true;
                }
            },
            achatHotel: function (p, simulation) {
                // Pour valider un hotel, il faut que les autres proprietes aient au moins 4 maisons. On les achete maintenant si on les trouve
                if (p.from.type == "maison" && p.to.type == "hotel") {
                    // On achete les maisons sur le meme groupe s'il y en a
                    for (var project in projects) {
                        var p2 = projects[project];
                        if (p2.color == p.color && p2.from.type == "maison" && p2.to.type == "maison" && p2.to.nb == 4) {
                            // On les achete maintenant
                            actions.achatMaison(p2, simulation);
                        }
                    }
                    // Verifie qu'il y a assez de maison disponible
                    var resteMaison = 4 - p.from.nb;
                    if (resteMaison > simulation.reste.maison) {
                        // Impossible, pas assez de maison, on renvoie un nombre de maison negatif et on sort
                        simulation.reste.maison -= resteMaison;
                        return;
                    } else {
                        // On achete un hotel
                        simulation.reste.hotel--;
                        simulation.achat.hotel++;
                        simulation.reste.maison += p.from.nb;
                        simulation.achat.maison -= p.from.nb;
                    }
                    p.done = true;
                }
            },
            venteHotel: function (p, simulation) {
                if (p.from.type == "hotel" && p.to.type == "maison") {
                    // Verifie qu'il y a assez de maison disponible
                    if (p.to.nb > simulation.reste.maison) {
                        // Impossible, pas assez de maison, on renvoie un nombre de maison negatif et on sort
                        simulation.reste.maison -= p.to.nb;
                        return;
                    } else {
                        // On vend l'hotel et on place des maisons
                        simulation.reste.hotel++;
                        simulation.achat.hotel--;
                        simulation.reste.maison -= p.to.nb;
                        simulation.achat.maison += p.to.nb;
                    }
                    p.done = true;
                }
            },
            achatMaison: function (p, simulation) {
                if (p.from.type == "maison" && p.to.type == "maison" && p.from.nb < p.to.nb) {
                    var nb = p.from.nb - p.to.nb;
                    simulation.achat.maison -= nb;
                    simulation.reste.maison += nb;
                    p.done = true;
                }
            }
        }
        for (var a in actions) {
            var action = actions[a];
            for (var index in projects) {
                var p = projects[index];
                if (p.done == null) {
                    try {
                        action(p, simulation);
                    } catch (e) {
                        // Exception levee si le traitement doit etre interrompu
                        console.log("exception");
                        return simulation;
                    }
                }
            }
        }
        return simulation;
    }
}