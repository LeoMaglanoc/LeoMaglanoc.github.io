use crate::game::Position;

/// Reversible game history. New moves after undo discard the old continuation.
pub struct History {
    positions: Vec<Position>,
    actions: Vec<usize>,
    cursor: usize,
}
impl History {
    pub fn new() -> Self {
        Self {
            positions: vec![Position::default()],
            actions: vec![],
            cursor: 0,
        }
    }
    pub fn position(&self) -> Position {
        self.positions[self.cursor]
    }
    pub fn cursor(&self) -> usize {
        self.cursor
    }
    pub fn len(&self) -> usize {
        self.actions.len()
    }
    pub fn is_empty(&self) -> bool {
        self.actions.is_empty()
    }
    pub fn last_move(&self) -> Option<[usize; 2]> {
        if self.cursor == 0 {
            None
        } else {
            let (s, t) = self.positions[self.cursor - 1].squares(self.actions[self.cursor - 1]);
            Some([s, t])
        }
    }
    pub fn play(&mut self, action: usize) -> Result<(), String> {
        let next = self.position().play(action)?;
        self.positions.truncate(self.cursor + 1);
        self.actions.truncate(self.cursor);
        self.positions.push(next);
        self.actions.push(action);
        self.cursor += 1;
        Ok(())
    }
    pub fn undo(&mut self) -> bool {
        if self.cursor == 0 {
            false
        } else {
            self.cursor -= 1;
            true
        }
    }
    pub fn redo(&mut self) -> bool {
        if self.cursor == self.actions.len() {
            false
        } else {
            self.cursor += 1;
            true
        }
    }
}
impl Default for History {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod history_tests {
    use super::*;
    #[test]
    fn undo_redo_and_branch() {
        let mut h = History::new();
        let initial = h.position();
        h.play(initial.legal()[0]).unwrap();
        let first = h.position();
        h.play(first.legal()[0]).unwrap();
        let second = h.position();
        assert_eq!(h.cursor(), 2);
        assert!(h.undo());
        assert_eq!(h.position(), first);
        assert!(h.undo());
        assert_eq!(h.position(), initial);
        assert!(!h.undo());
        assert!(h.redo());
        assert_eq!(h.position(), first);
        assert!(h.redo());
        assert_eq!(h.position(), second);
        assert!(!h.redo());
        h.undo();
        let alternative = h.position().legal()[1];
        h.play(alternative).unwrap();
        assert_eq!(h.len(), 2);
        assert!(!h.redo());
        assert_ne!(h.position(), second);
        let before = h.position();
        assert!(h.play(108).is_err());
        assert_eq!(before, h.position());
    }
}
