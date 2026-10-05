use crate::mcts::Evaluator;
use crate::{
    history::History,
    mcts::Search,
    model::{Cpu, Network, Weights},
};
use serde::Serialize;
use wasm_bindgen::prelude::*;
#[derive(Serialize)]
struct Legal {
    action: usize,
    from: usize,
    to: usize,
}
#[derive(Serialize)]
struct Snapshot {
    board: Vec<i8>,
    side: bool,
    terminal: Option<f32>,
    legal: Vec<Legal>,
    ply: usize,
    total_plies: usize,
    last_move: Option<[usize; 2]>,
}
#[wasm_bindgen]
pub struct Game {
    history: History,
    model: Option<Network<Cpu>>,
    search: Option<Search>,
}
#[wasm_bindgen]
impl Game {
    #[wasm_bindgen(constructor)]
    pub fn new(checkpoint: &str) -> Result<Game, JsValue> {
        let model = if checkpoint.is_empty() {
            None
        } else {
            let w: Weights =
                serde_json::from_str(checkpoint).map_err(|e| JsValue::from_str(&e.to_string()))?;
            Some(Network::from_weights(&w).map_err(|e| JsValue::from_str(&e))?)
        };
        Ok(Self {
            history: History::new(),
            model,
            search: None,
        })
    }
    pub fn state(&self) -> String {
        let p = self.history.position();
        serde_json::to_string(&Snapshot {
            board: p.board(),
            side: p.side,
            terminal: p.terminal(),
            legal: p
                .legal()
                .iter()
                .map(|&a| {
                    let (from, to) = p.squares(a);
                    Legal {
                        action: a,
                        from,
                        to,
                    }
                })
                .collect(),
            ply: self.history.cursor(),
            total_plies: self.history.len(),
            last_move: self.history.last_move(),
        })
        .unwrap()
    }
    pub fn play(&mut self, action: usize) -> Result<(), JsValue> {
        self.history
            .play(action)
            .map_err(|e| JsValue::from_str(&e))?;
        self.search = None;
        Ok(())
    }
    pub fn reset(&mut self) {
        self.history = History::new();
        self.search = None;
    }
    /// -1 = one ply in local mode, 0/1 = rewind to the human White/Black turn.
    pub fn back(&mut self, human: i8) {
        self.history.undo();
        while human >= 0
            && self.history.cursor() > 0
            && self.history.position().side != (human == 1)
        {
            self.history.undo();
        }
        self.search = None;
    }
    pub fn forward(&mut self, human: i8) {
        self.history.redo();
        while human >= 0
            && self.history.cursor() < self.history.len()
            && self.history.position().side != (human == 1)
        {
            self.history.redo();
        }
        self.search = None;
    }
    pub fn start_search(&mut self) -> Result<(), JsValue> {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Two-player mode has no neural model"))?;
        self.search = Some(Search::new(self.history.position(), model, 1.5));
        Ok(())
    }
    pub fn search_chunk(&mut self, simulations: usize) -> Result<String, JsValue> {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No neural model"))?;
        let search = self
            .search
            .as_mut()
            .ok_or_else(|| JsValue::from_str("Start search first"))?;
        search.run(model, simulations.min(256));
        Ok(serde_json::to_string(&serde_json::json!({"stats":search.stats(),"value":search.value(),"best":search.best()})).unwrap())
    }
    pub fn finish_search(&mut self) -> Result<usize, JsValue> {
        let action = self
            .search
            .as_ref()
            .and_then(Search::best)
            .ok_or_else(|| JsValue::from_str("No legal action"))?;
        self.play(action)?;
        Ok(action)
    }
    pub fn inference(&self) -> Result<String, JsValue> {
        let model = self
            .model
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No neural model"))?;
        let (p, v) = model.evaluate(&self.history.position());
        Ok(serde_json::to_string(&serde_json::json!({"policy":p.to_vec(),"value":v})).unwrap())
    }
}
