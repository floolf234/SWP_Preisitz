export type Direction = 'Up' | 'Down' | 'Idle'

export interface Call {
  floor: number
  direction: Direction
}

type DoorState = 'Closed' | 'Opening' | 'Open' | 'Closing'

export default class Aufzug {
  readonly minFloor: number
  readonly maxFloor: number

  currentFloor: number
  direction: Direction = 'Idle' // aktuelle Bewegungsrichtung (bzw. beabsichtigte)

  // Türen: Zustand + Timer
  private doorState: DoorState = 'Closed'
  private doorTimer = 0

  // Bewegung: ob gerade eine Stockwerksfahrt läuft + Timer
  private moving = false
  private moveTimer = 0

  // Dauer-Konstanten (Sekunden)
  private readonly DOOR_DURATION = 1 // öffnen ODER schließen dauert 1s
  private readonly FLOOR_TRAVEL_DURATION = 3 // eine Etage fährt in 3s

  private internalRequests = new Set<number>() // Knöpfe im Panel
  private externalCalls = new Map<string, Call>() // key: `${floor}:${direction}`

  constructor(minFloor: number, maxFloor: number, startFloor = minFloor) {
    this.minFloor = minFloor
    this.maxFloor = maxFloor
    this.currentFloor = this.clamp(startFloor)
  }

  // Passagier im Lift drückt Knopf
  pressPanelButton(floor: number) {
    if (!this.validFloor(floor)) return
    this.internalRequests.add(floor)
  }

  // Ruf von außen: Stockwerk + gewünschte Richtung
  callFromFloor(floor: number, direction: 'Up' | 'Down') {
    if (!this.validFloor(floor)) return
    const key = this.callKey(floor, direction)
    if (!this.externalCalls.has(key)) this.externalCalls.set(key, { floor, direction })
  }

  // Starte Öffnen (dauert DOOR_DURATION). Direction bleibt erhalten (wichtig für Call-Erfüllung).
  openDoors() {
    if (this.doorState === 'Open' || this.doorState === 'Opening') return
    this.doorState = 'Opening'
    this.doorTimer = this.DOOR_DURATION
    console.log(`Türen beginnen zu öffnen (Etage ${this.currentFloor})`)
  }

  // Starte Schließen (dauert DOOR_DURATION)
  closeDoors() {
    if (this.doorState === 'Closed' || this.doorState === 'Closing') return
    this.doorState = 'Closing'
    this.doorTimer = this.DOOR_DURATION
    console.log(`Türen beginnen zu schließen`)
  }

  // Ein Tick: deltaSeconds simuliert verstrichene Zeit. Unterstützt Tür-/Fahr-Timer.
  step(deltaSeconds: number) {
    // 1) Fortschritt Türen
    if (this.doorState === 'Opening' || this.doorState === 'Closing') {
      this.doorTimer -= deltaSeconds
      if (this.doorTimer <= 0) {
        if (this.doorState === 'Opening') {
          this.doorState = 'Open'
          console.log(`Türen geöffnet auf Etage ${this.currentFloor}`)
          // Wenn Türen nun vollständig offen sind -> Erfüllen
          this.serveCurrentFloor()
          // Automatisch schließen starten (öffnet -> kurze Bedienung -> schließen)
          this.closeDoors()
        } else {
          this.doorState = 'Closed'
          console.log(`Türen geschlossen`)
        }
        this.doorTimer = 0
      }
    }

    // 2) Fortschritt Bewegung
    if (this.moving) {
      this.moveTimer -= deltaSeconds
      if (this.moveTimer <= 0) {
        // eine Etage geschafft
        if (this.direction === 'Up' && this.currentFloor < this.maxFloor) this.currentFloor++
        else if (this.direction === 'Down' && this.currentFloor > this.minFloor) this.currentFloor--
        console.log(`Angekommen: Etage ${this.currentFloor}`)
        this.moving = false
        this.moveTimer = 0
        // nach Ankunft ggf. Türen öffnen (wenn hier angehalten werden soll)
        if (this.shouldOpenAtCurrentFloor()) this.openDoors()
      }
    }

    // 3) Wenn nicht in Bewegung und Türen geschlossen, evtl. neue Fahrt starten
    if (!this.moving && this.doorState === 'Closed') {
      if (this.direction === 'Idle') {
        const next = this.chooseNextTargetFloor()
        if (next !== null) this.direction = next > this.currentFloor ? 'Up' : 'Down'
      }

      if (this.canStartMove()) {
        // starte Fahrt um eine Etage (dauer FLOOR_TRAVEL_DURATION)
        this.moving = true
        this.moveTimer = this.FLOOR_TRAVEL_DURATION
        console.log(`Starte Fahrt ${this.direction} (nächste Etage in ${this.moveTimer}s)`)
      }
    }
  }

  // Hilfsfunktionen

  private serveCurrentFloor() {
    // erfülle interne Requests (wenn Türen offen)
    if (this.internalRequests.delete(this.currentFloor)) {
      console.log(`Internes Ziel (${this.currentFloor}) erfüllt`)
    }

    // erfülle externe Calls nur wenn Richtung passt (Aufzug "ist dabei" in diese Richtung oder Idle)
    const toRemove: string[] = []
    for (const [key, call] of this.externalCalls.entries()) {
      if (call.floor === this.currentFloor) {
        // erfüllt wenn Aufzug sich in der gerufenen Richtung befindet (oder Idle)
        if (this.direction === call.direction || this.direction === 'Idle') {
          toRemove.push(key)
          console.log(`Externen Ruf auf Etage ${call.floor} (${call.direction}) erfüllt`)
        }
      }
    }
    for (const k of toRemove) this.externalCalls.delete(k)

    // nach dem Servieren neue Richtung bestimmen (bleibt Idle, falls nichts mehr)
    if (!this.internalRequests.size && !this.externalCalls.size) {
      this.direction = 'Idle'
    } else {
      if (this.hasTargetAbove()) this.direction = 'Up'
      else if (this.hasTargetBelow()) this.direction = 'Down'
      else this.direction = 'Idle'
    }
  }

  private shouldOpenAtCurrentFloor(): boolean {
    // öffnet nur wenn interne Anforderung für diese Etage existiert
    if (this.internalRequests.has(this.currentFloor)) return true
    // externe Calls nur öffnen, wenn Richtung passt (Aufzug beabsichtigt in diese Richtung zu fahren oder Idle)
    for (const call of this.externalCalls.values()) {
      if (call.floor === this.currentFloor && (this.direction === call.direction || this.direction === 'Idle')) {
        return true
      }
    }
    return false
  }

  private chooseNextTargetFloor(): number | null {
    const targets = new Set<number>()
    for (const f of this.internalRequests) targets.add(f)
    for (const call of this.externalCalls.values()) targets.add(call.floor)
    if (targets.size === 0) return null
    let best: number | null = null
    let bestDist = Infinity
    for (const t of targets) {
      const d = Math.abs(t - this.currentFloor)
      if (d < bestDist) {
        bestDist = d
        best = t
      }
    }
    return best
  }

  private canStartMove(): boolean {
    return this.doorState === 'Closed' && !this.moving && (this.direction === 'Up' || this.direction === 'Down')
  }

  private hasTargetAbove(): boolean {
    for (const f of this.internalRequests) if (f > this.currentFloor) return true
    for (const c of this.externalCalls.values()) if (c.floor > this.currentFloor) return true
    return false
  }

  private hasTargetBelow(): boolean {
    for (const f of this.internalRequests) if (f < this.currentFloor) return true
    for (const c of this.externalCalls.values()) if (c.floor < this.currentFloor) return true
    return false
  }

  private validFloor(f: number) {
    return f >= this.minFloor && f <= this.maxFloor
  }

  private clamp(f: number) {
    if (f < this.minFloor) return this.minFloor
    if (f > this.maxFloor) return this.maxFloor
    return f
  }

  private callKey(floor: number, direction: Direction) {
    return `${floor}:${direction}`
  }

  // Debug / Status
  status() {
    return {
      floor: this.currentFloor,
      direction: this.direction,
      doorState: this.doorState,
      doorTimer: this.doorTimer,
      moving: this.moving,
      moveTimer: this.moveTimer,
      internal: Array.from(this.internalRequests).sort((a, b) => a - b),
      external: Array.from(this.externalCalls.values())
    }
  }
}
