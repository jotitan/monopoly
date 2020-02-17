package dice

import (
	"math/rand"
	"time"
)

var randSource = rand.New(rand.NewSource(time.Now().UnixNano()))

func Throw(nbDice int)[]int{
	dices := make([]int,nbDice)
	for i := 0 ; i < nbDice ; i++{
		dices[i] = randSource.Int()%6+1
	}
	return dices
}
